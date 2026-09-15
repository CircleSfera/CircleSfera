import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { safeFetchMedia } from './safe-media-fetcher.js';
import { SsrfBlockedError } from './ssrf.util.js';

// Valid WAV audio buffer recognized by file-type
const VALID_AUDIO_BUFFER = Buffer.from([
  0x52,
  0x49,
  0x46,
  0x46, // RIFF
  0x24,
  0x00,
  0x00,
  0x00, // size
  0x57,
  0x41,
  0x56,
  0x45, // WAVE
  0x66,
  0x6d,
  0x74,
  0x20, // fmt
  0x10,
  0x00,
  0x00,
  0x00, // 16
  0x01,
  0x00, // PCM
  0x01,
  0x00, // 1 channel
  0x44,
  0xac,
  0x00,
  0x00, // 44100
  0x88,
  0x58,
  0x01,
  0x00, // byte rate
  0x02,
  0x00, // block align
  0x10,
  0x00, // bits per sample
  0x64,
  0x61,
  0x74,
  0x61, // data
  0x00,
  0x00,
  0x00,
  0x00, // 0 bytes
]);

// Minimal valid MP4 header (ftyp box)
const VALID_MP4_HEADER = Buffer.from([
  0x00,
  0x00,
  0x00,
  0x18,
  0x66,
  0x74,
  0x79,
  0x70, // size 24, 'ftyp'
  0x69,
  0x73,
  0x6f,
  0x6d,
  0x00,
  0x00,
  0x02,
  0x00, // 'isom', minor 512
  0x69,
  0x73,
  0x6f,
  0x6d,
  0x69,
  0x73,
  0x6f,
  0x32, // compatible brands
  ...Array(100).fill(0x00),
]);

describe('safeFetchMedia', () => {
  let mockServer: http.Server;
  let serverPort: number;
  const baseUrl = () => `http://127.0.0.1:${serverPort}`;

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      const parsed = new URL(req.url ?? '/', `http://127.0.0.1:${serverPort}`);

      if (parsed.pathname === '/valid-mp3') {
        res.writeHead(200, { 'Content-Type': 'audio/wav' });
        res.end(VALID_AUDIO_BUFFER);
        return;
      }

      if (parsed.pathname === '/valid-mp4') {
        res.writeHead(200, { 'Content-Type': 'video/mp4' });
        res.end(VALID_MP4_HEADER);
        return;
      }

      if (parsed.pathname === '/invalid-binary') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(Buffer.from('Not an audio or video file at all!'));
        return;
      }

      if (parsed.pathname === '/declared-oversized') {
        res.writeHead(200, {
          'Content-Type': 'audio/wav',
          'Content-Length': '104857600', // 100MB
        });
        res.end(Buffer.alloc(1024));
        return;
      }

      if (parsed.pathname === '/stream-oversized') {
        res.writeHead(200, { 'Content-Type': 'audio/wav' });
        // Send chunks continuously exceeding limit
        res.write(Buffer.alloc(1024 * 500));
        res.write(Buffer.alloc(1024 * 600));
        res.end();
        return;
      }

      if (parsed.pathname === '/slow-response') {
        // Intentionally delay responding to trigger timeout
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'audio/wav' });
          res.end(VALID_AUDIO_BUFFER);
        }, 500);
        return;
      }

      if (parsed.pathname === '/redirect-to-mp3') {
        res.writeHead(302, { Location: '/valid-mp3' });
        res.end();
        return;
      }

      if (parsed.pathname === '/redirect-loop') {
        res.writeHead(302, { Location: '/redirect-loop' });
        res.end();
        return;
      }

      if (parsed.pathname === '/redirect-to-metadata') {
        res.writeHead(302, {
          Location: 'http://169.254.169.254/latest/meta-data/',
        });
        res.end();
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  describe('Local Uploads (/uploads/...) handling', () => {
    const testUploadsDir = path.resolve(process.cwd(), 'uploads');
    const testFile = path.join(testUploadsDir, 'test-audio-unit.wav');

    beforeAll(() => {
      if (!fs.existsSync(testUploadsDir)) {
        fs.mkdirSync(testUploadsDir, { recursive: true });
      }
      fs.writeFileSync(testFile, VALID_AUDIO_BUFFER);
    });

    afterAll(() => {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    });

    it('successfully reads local media from /uploads/ directory', async () => {
      const result = await safeFetchMedia('/uploads/test-audio-unit.wav');
      expect(result.buffer).toBeDefined();
      expect(result.contentType).toBe('audio/wav');
      expect(result.ext).toBe('wav');
    });

    it('rejects path traversal in local path', async () => {
      await expect(safeFetchMedia('/uploads/../../etc/passwd')).rejects.toThrow(
        SsrfBlockedError,
      );
    });

    it('rejects local file exceeding maxBytes', async () => {
      await expect(
        safeFetchMedia('/uploads/test-audio-unit.wav', { maxBytes: 10 }),
      ).rejects.toThrow(PayloadTooLargeException);
    });
  });

  describe('SSRF Protection on Remote URLs', () => {
    it('blocks direct access to 169.254.169.254 (Cloud metadata)', async () => {
      await expect(
        safeFetchMedia('http://169.254.169.254/latest/meta-data/', {
          requireHttps: false,
          allowedPorts: [80, 443, serverPort],
        }),
      ).rejects.toThrow(SsrfBlockedError);
    });

    it('blocks access to localhost / 127.0.0.1 by default', async () => {
      await expect(
        safeFetchMedia(`http://127.0.0.1:${serverPort}/valid-mp3`, {
          requireHttps: false,
          allowedPorts: [80, 443, serverPort],
        }),
      ).rejects.toThrow(SsrfBlockedError);
    });

    it('blocks domains resolving to private IP via custom DNS lookup', async () => {
      const mockDns = (async () => [{ address: '10.0.0.1', family: 4 }]) as any;

      await expect(
        safeFetchMedia('https://internal.evil.com/audio.mp3', {
          requireHttps: false,
          dnsLookup: mockDns,
        }),
      ).rejects.toThrow(/resolved to private IP/);
    });

    it('blocks HTTP redirects to private metadata target', async () => {
      // Mock lookup pointing to 8.8.8.8 for initial URL validation to pass,
      // but redirecting to 169.254.169.254
      await expect(
        safeFetchMedia('http://169.254.169.254/redirect-to-metadata', {
          requireHttps: false,
          allowedPorts: [80, 443, serverPort],
        }),
      ).rejects.toThrow(SsrfBlockedError);
    });
  });

  describe('Resource Bounds & Validations', () => {
    it('rejects payload exceeding Content-Length header', async () => {
      // With validateTargetUrl mocked to public
      await expect(
        safeFetchMedia(`${baseUrl()}/declared-oversized`, {
          requireHttps: false,
          allowedPorts: [serverPort],
          maxBytes: 1024,
          // Custom DNS that allows our loopback for this specific test
          dnsLookup: (async () => [{ address: '127.0.0.1', family: 4 }]) as any,
        }),
      ).rejects.toThrow();
    });

    it('rejects slow responses exceeding timeout', async () => {
      await expect(
        safeFetchMedia(`${baseUrl()}/slow-response`, {
          requireHttps: false,
          allowedPorts: [serverPort],
          timeoutMs: 50,
          dnsLookup: (async () => [{ address: '127.0.0.1', family: 4 }]) as any,
        }),
      ).rejects.toThrow();
    });

    it('rejects files that fail magic-byte validation (UPLOAD-001)', async () => {
      // Create a local text file claimed to be audio
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      const fakeAudioPath = path.join(uploadsDir, 'fake-audio.mp3');
      fs.writeFileSync(
        fakeAudioPath,
        'This is plain text disguised as an mp3 file!',
      );

      try {
        await expect(
          safeFetchMedia('/uploads/fake-audio.mp3', {
            allowedMimeTypes: ['audio/mpeg', 'audio/wav', 'video/mp4'],
          }),
        ).rejects.toThrow(UnsupportedMediaTypeException);
      } finally {
        if (fs.existsSync(fakeAudioPath)) {
          fs.unlinkSync(fakeAudioPath);
        }
      }
    });
  });
});
