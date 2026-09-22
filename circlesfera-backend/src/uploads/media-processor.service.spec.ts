import { UnsupportedMediaTypeException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import sharp from 'sharp';
import { type Mock, vi } from 'vitest';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';
import { MediaProcessorService } from './media-processor.service.js';

// Mock Sharp
vi.mock('sharp', () => {
  const sharpMock = {
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
    resize: vi.fn().mockReturnThis(),
    rotate: vi.fn().mockReturnThis(),
    avif: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-data')),
  };
  return {
    default: vi.fn(() => sharpMock),
  };
});

describe('MediaProcessorService', () => {
  let service: MediaProcessorService;
  const mockSharp = sharp as unknown as Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MediaProcessorService],
    }).compile();

    service = module.get<MediaProcessorService>(MediaProcessorService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should skip non-image files', async () => {
    const file: UploadedFile = {
      originalname: 'test.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from('hello'),
    };

    const result = await service.process(file);
    expect(result.original.mimetype).toBe('text/plain');
    expect(result.original.buffer).toEqual(file.buffer);
    expect(result.standard.buffer).toEqual(file.buffer);
    expect(result.thumbnail.buffer).toEqual(file.buffer);
    expect(mockSharp).not.toHaveBeenCalled();
  });

  it('handles video and gif files by skipping Sharp processing', async () => {
    const videoFile: UploadedFile = {
      originalname: 'test.mp4',
      mimetype: 'video/mp4',
      buffer: Buffer.from('video'),
    };
    const videoResult = await service.process(videoFile);
    expect(videoResult.original.mimetype).toBe('video/mp4');

    const gifFile: UploadedFile = {
      originalname: 'anim.gif',
      mimetype: 'image/gif',
      buffer: Buffer.from('gif'),
    };
    const gifResult = await service.process(gifFile);
    expect(gifResult.original.mimetype).toBe('image/gif');
  });

  it('should process images to AVIF by default for all variants', async () => {
    const file: UploadedFile = {
      originalname: 'test.png',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-png'),
    };

    const result = await service.process(file);

    expect(mockSharp).toHaveBeenCalled();
    expect(result.original.mimetype).toBe('image/avif');
    expect(result.standard.mimetype).toBe('image/avif');
    expect(result.thumbnail.mimetype).toBe('image/avif');

    expect(result.original.buffer.toString()).toBe('processed-data');
  });

  it('should fallback to WebP if AVIF fails', async () => {
    const file: UploadedFile = {
      originalname: 'test.png',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-png'),
    };

    // Mock sharp to fail on AVIF
    const sharpMock = {
      metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
      resize: vi.fn().mockReturnThis(),
      rotate: vi.fn().mockReturnThis(),
      avif: vi.fn().mockImplementation(() => {
        throw new Error('AVIF failed');
      }),
      webp: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('webp-data')),
    };
    mockSharp.mockReturnValue(sharpMock);

    const result = await service.process(file);

    expect(result.original.mimetype).toBe('image/webp');
    expect(result.original.buffer.toString()).toBe('webp-data');
  });

  it('should generate HLS adaptive manifests for video files', async () => {
    const file: UploadedFile = {
      originalname: 'intro.mp4',
      mimetype: 'video/mp4',
      buffer: Buffer.from('video-bytes'),
    };

    const manifest = await service.processVideoHls(file);
    expect(manifest.masterPlaylist).toContain('#EXTM3U');
    expect(manifest.masterPlaylist).toContain('intro_720p.m3u8');
    expect(manifest.masterPlaylist).toContain('intro_1080p.m3u8');
    expect(manifest.segmentCount).toBe(2);
  });

  it('should reject SVG files under security policy (mitigates Stored XSS)', async () => {
    const file: UploadedFile = {
      originalname: 'vector.svg',
      mimetype: 'image/svg+xml',
      buffer: Buffer.from('<svg></svg>'),
    };

    await expect(service.process(file)).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('throws PayloadTooLargeException if image resolution exceeds limit', async () => {
    const sharpMock = {
      metadata: vi.fn().mockResolvedValue({ width: 10000, height: 10000 }),
    };
    mockSharp.mockReturnValue(sharpMock);

    const file: UploadedFile = {
      originalname: 'giant.png',
      mimetype: 'image/png',
      buffer: Buffer.from('giant-bytes'),
    };

    await expect(service.process(file)).rejects.toThrow(
      'Image resolution exceeds the maximum allowed',
    );
  });

  it('falls back to original buffer when variant processing fails completely', async () => {
    const sharpMock = {
      metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
      resize: vi.fn().mockReturnThis(),
      rotate: vi.fn().mockReturnThis(),
      avif: vi.fn().mockImplementation(() => {
        throw new Error('AVIF fatal');
      }),
      webp: vi.fn().mockImplementation(() => {
        throw new Error('WebP fatal');
      }),
    };
    mockSharp.mockReturnValue(sharpMock);

    const file: UploadedFile = {
      originalname: 'broken.png',
      mimetype: 'image/png',
      buffer: Buffer.from('broken-bytes'),
    };

    const result = await service.process(file);
    expect(result.original.buffer).toEqual(file.buffer);
    expect(result.standard.buffer).toEqual(file.buffer);
    expect(result.thumbnail.buffer).toEqual(file.buffer);
  });

  it('converts buffer to avif with toAvif', async () => {
    const sharpMock = {
      avif: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('avif-output')),
    };
    mockSharp.mockReturnValue(sharpMock);

    const result = await service.toAvif(Buffer.from('input'));
    expect(result.toString()).toBe('avif-output');
  });

  describe('evaluateContentSafety', () => {
    it('returns safe for non-image media', async () => {
      const result = await service.evaluateContentSafety(
        Buffer.from('audio'),
        'audio/mp3',
      );
      expect(result).toEqual({
        isSafe: true,
        safetyScore: 1.0,
        rating: 'EVERYONE',
      });
    });

    it('returns EVERYONE for valid dimensions', async () => {
      const sharpMock = {
        metadata: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
      };
      mockSharp.mockReturnValue(sharpMock);

      const result = await service.evaluateContentSafety(
        Buffer.from('pic'),
        'image/jpeg',
      );
      expect(result.isSafe).toBe(true);
      expect(result.rating).toBe('EVERYONE');
      expect(result.safetyScore).toBe(0.98);
    });

    it('returns MATURE for small dimensions', async () => {
      const sharpMock = {
        metadata: vi.fn().mockResolvedValue({ width: 20, height: 20 }),
      };
      mockSharp.mockReturnValue(sharpMock);

      const result = await service.evaluateContentSafety(
        Buffer.from('tiny'),
        'image/png',
      );
      expect(result.isSafe).toBe(false);
      expect(result.rating).toBe('MATURE');
      expect(result.safetyScore).toBe(0.6);
    });

    it('handles metadata exception gracefully and returns fallback score', async () => {
      const sharpMock = {
        metadata: vi.fn().mockRejectedValue(new Error('Corrupt metadata')),
      };
      mockSharp.mockReturnValue(sharpMock);

      const result = await service.evaluateContentSafety(
        Buffer.from('corrupted'),
        'image/png',
      );
      expect(result.isSafe).toBe(true);
      expect(result.safetyScore).toBe(0.9);
      expect(result.rating).toBe('EVERYONE');
    });
  });
});
