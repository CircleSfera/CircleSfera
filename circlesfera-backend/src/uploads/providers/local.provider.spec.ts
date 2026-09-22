import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadedFile } from '../interfaces/uploaded-file.interface.js';
import { LocalStorageProvider } from './local.provider.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn((path: any) => actual.existsSync(path)),
    mkdirSync: vi.fn((path: any, options?: any) =>
      actual.mkdirSync(path, options),
    ),
    writeFileSync: vi.fn((file: any, data: any, options?: any) =>
      actual.writeFileSync(file, data, options),
    ),
    unlinkSync: vi.fn((path: any) => actual.unlinkSync(path)),
  };
});

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new LocalStorageProvider();
  });

  describe('constructor', () => {
    it('creates upload directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

      const p = new LocalStorageProvider();
      expect(p).toBeDefined();
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('handles startup write test failure gracefully without crashing', () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      expect(() => new LocalStorageProvider()).not.toThrow();
    });
  });

  describe('upload', () => {
    it('uploads an image file', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValueOnce(undefined);
      const file: UploadedFile = {
        buffer: Buffer.from('img'),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
      };

      const result = await provider.upload(file);
      expect(result.type).toBe('image');
      expect(result.url).toMatch(/^\/uploads\/[a-f0-9-]+\.jpe?g$/);
    });

    it('uploads a video file', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValueOnce(undefined);
      const file: UploadedFile = {
        buffer: Buffer.from('vid'),
        mimetype: 'video/mp4',
        originalname: 'test.mp4',
      };

      const result = await provider.upload(file);
      expect(result.type).toBe('video');
      expect(result.url).toMatch(/^\/uploads\/[a-f0-9-]+\.mp4$/);
    });

    it('uploads other media formats (e.g. audio/octet-stream)', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValueOnce(undefined);
      const file: UploadedFile = {
        buffer: Buffer.from('audio'),
        mimetype: 'audio/mp3',
        originalname: 'test.mp3',
      };

      const result = await provider.upload(file);
      expect(result.type).toBe('other');
    });

    it('throws wrapped Error when writeFile fails', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(
        new Error('Disk write failed'),
      );
      const file: UploadedFile = {
        buffer: Buffer.from('data'),
        mimetype: 'image/png',
        originalname: 'test.png',
      };

      await expect(provider.upload(file)).rejects.toThrow(
        'LocalStorage Error: Disk write failed',
      );
    });
  });

  describe('delete', () => {
    it('deletes file successfully', async () => {
      const unlinkSpy = vi
        .spyOn(fs.promises, 'unlink')
        .mockResolvedValueOnce(undefined);

      await provider.delete('/uploads/test.jpg');
      expect(unlinkSpy).toHaveBeenCalledWith(
        expect.stringContaining('test.jpg'),
      );
    });

    it('handles ENOENT gracefully as no-op', async () => {
      const err: any = new Error('File not found');
      err.code = 'ENOENT';
      vi.spyOn(fs.promises, 'unlink').mockRejectedValueOnce(err);

      await expect(
        provider.delete('/uploads/missing.jpg'),
      ).resolves.not.toThrow();
    });

    it('re-throws other filesystem errors', async () => {
      const err: any = new Error('EACCES');
      err.code = 'EACCES';
      vi.spyOn(fs.promises, 'unlink').mockRejectedValueOnce(err);

      await expect(provider.delete('/uploads/forbidden.jpg')).rejects.toThrow(
        'EACCES',
      );
    });
  });

  describe('listFiles', () => {
    it('lists valid non-hidden files and handles concurrent deletion', async () => {
      vi.spyOn(fs.promises, 'readdir').mockResolvedValueOnce([
        '.hidden' as any,
        'deleted.jpg' as any,
        'visible.jpg' as any,
      ]);
      vi.spyOn(fs.promises, 'stat')
        .mockRejectedValueOnce(new Error('ENOENT')) // deleted concurrently
        .mockResolvedValueOnce({
          isFile: () => true,
          mtime: new Date('2026-09-01'),
          size: 1024,
        } as any);

      const files = await provider.listFiles();
      expect(files).toHaveLength(1);
      expect(files[0].url).toBe('/uploads/visible.jpg');
      expect(files[0].sizeBytes).toBe(1024);
    });

    it('returns empty array when readdir throws ENOENT', async () => {
      const err: any = new Error('Not found');
      err.code = 'ENOENT';
      vi.spyOn(fs.promises, 'readdir').mockRejectedValueOnce(err);

      const files = await provider.listFiles();
      expect(files).toEqual([]);
    });

    it('returns empty array and logs when readdir throws generic error', async () => {
      vi.spyOn(fs.promises, 'readdir').mockRejectedValueOnce(
        new Error('Directory read error'),
      );

      const files = await provider.listFiles();
      expect(files).toEqual([]);
    });
  });

  describe('storeHlsArtifacts', () => {
    it('copies output directory to target directory when paths differ', async () => {
      const mkdirSpy = vi
        .spyOn(fs.promises, 'mkdir')
        .mockResolvedValue(undefined as any);
      const cpSpy = vi
        .spyOn(fs.promises, 'cp')
        .mockResolvedValue(undefined as any);

      const result = await provider.storeHlsArtifacts({
        baseName: 'stream1',
        outputDir: '/tmp/stream1-artifacts',
      });

      expect(mkdirSpy).toHaveBeenCalled();
      expect(cpSpy).toHaveBeenCalledWith(
        '/tmp/stream1-artifacts',
        expect.stringContaining('stream1'),
        { recursive: true },
      );
      expect(result.masterPlaylistUrl).toBe('/uploads/stream1/master.m3u8');
      expect(result.thumbnailUrl).toBe('/uploads/stream1/thumb.jpg');
    });

    it('skips copy when outputDir is already targetDir', async () => {
      const cpSpy = vi.spyOn(fs.promises, 'cp');
      const targetPath = path.join((provider as any).uploadDir, 'stream2');

      const result = await provider.storeHlsArtifacts({
        baseName: 'stream2',
        outputDir: targetPath,
      });

      expect(cpSpy).not.toHaveBeenCalled();
      expect(result.masterPlaylistUrl).toBe('/uploads/stream2/master.m3u8');
    });
  });

  describe('getMediaArtifact', () => {
    it('rejects path traversal attempts outside base folder', async () => {
      const result = await provider.getMediaArtifact({
        baseFolder: 'hls-video',
        relativePath: '../../etc/passwd',
      });
      expect(result).toBeNull();
    });

    it('returns content and correct contentType for various extensions', async () => {
      vi.spyOn(fs.promises, 'readFile').mockResolvedValue(
        Buffer.from('m3u8-data'),
      );

      const m3u8 = await provider.getMediaArtifact({
        baseFolder: 'video1',
        relativePath: 'master.m3u8',
      });
      expect(m3u8?.contentType).toBe('application/vnd.apple.mpegurl');

      const ts = await provider.getMediaArtifact({
        baseFolder: 'video1',
        relativePath: 'seg.ts',
      });
      expect(ts?.contentType).toBe('video/MP2T');

      const png = await provider.getMediaArtifact({
        baseFolder: 'video1',
        relativePath: 'thumb.png',
      });
      expect(png?.contentType).toBe('image/png');

      const webp = await provider.getMediaArtifact({
        baseFolder: 'video1',
        relativePath: 'thumb.webp',
      });
      expect(webp?.contentType).toBe('image/webp');

      const mp4 = await provider.getMediaArtifact({
        baseFolder: 'video1',
        relativePath: 'clip.mp4',
      });
      expect(mp4?.contentType).toBe('video/mp4');

      const jpeg = await provider.getMediaArtifact({
        baseFolder: 'video1',
        relativePath: 'thumb.jpg',
      });
      expect(jpeg?.contentType).toBe('image/jpeg');

      const bin = await provider.getMediaArtifact({
        baseFolder: 'video1',
        relativePath: 'data.bin',
      });
      expect(bin?.contentType).toBe('application/octet-stream');
    });

    it('returns null when artifact is not found (ENOENT)', async () => {
      const err: any = new Error('File not found');
      err.code = 'ENOENT';
      vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(err);

      const result = await provider.getMediaArtifact({
        baseFolder: 'stream',
        relativePath: 'missing.m3u8',
      });
      expect(result).toBeNull();
    });

    it('rethrows unexpected filesystem error when reading artifact', async () => {
      const err: any = new Error('Read failed');
      err.code = 'EIO';
      vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(err);

      await expect(
        provider.getMediaArtifact({
          baseFolder: 'stream',
          relativePath: 'corrupt.m3u8',
        }),
      ).rejects.toThrow('Read failed');
    });
  });
});
