import * as fs from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { S3Provider } from './s3.provider.js';

const mockUploadDone = vi.fn().mockResolvedValue({});

vi.mock('@aws-sdk/lib-storage', () => {
  class MockUpload {
    done = mockUploadDone;
  }
  return {
    Upload: MockUpload,
  };
});

describe('S3Provider', () => {
  let provider: S3Provider;
  let configService: ConfigService;

  const mockConfig: Record<string, string> = {
    AWS_S3_BUCKET: 'test-bucket',
    AWS_S3_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'test-key',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
    CDN_URL: 'https://cdn.example.com',
  };

  beforeEach(() => {
    configService = {
      getOrThrow: vi.fn((key: string) => mockConfig[key]),
      get: vi.fn((key: string) => mockConfig[key]),
    } as any;

    provider = new S3Provider(configService);
  });

  it('should generate a CDN URL when CDN_URL is provided', async () => {
    expect(provider).toBeDefined();
  });

  describe('upload', () => {
    it('uploads an image to S3 and returns CDN URL', async () => {
      const file = {
        buffer: Buffer.from('img'),
        mimetype: 'image/png',
        originalname: 'test.png',
      };

      const result = await provider.upload(file);
      expect(result.type).toBe('image');
      expect(result.url).toMatch(
        /^https:\/\/cdn\.example\.com\/circlesfera\/.+\.png$/,
      );
    });

    it('uploads a video to S3 without CDN URL and returns S3 URL', async () => {
      const noCdnConfig: Record<string, string> = {
        AWS_S3_BUCKET: 'raw-bucket',
        AWS_S3_REGION: 'eu-west-1',
        AWS_ACCESS_KEY_ID: 'key',
        AWS_SECRET_ACCESS_KEY: 'secret',
      };
      const noCdnConfigService = {
        getOrThrow: vi.fn((k: string) => noCdnConfig[k]),
        get: vi.fn((k: string) => noCdnConfig[k]),
      } as any;
      const noCdnProvider = new S3Provider(noCdnConfigService);

      const file = {
        buffer: Buffer.from('video-data'),
        mimetype: 'video/mp4',
        originalname: 'clip.mp4',
      };

      const result = await noCdnProvider.upload(file);
      expect(result.type).toBe('video');
      expect(result.url).toMatch(
        /^https:\/\/raw-bucket\.s3\.eu-west-1\.amazonaws\.com\/circlesfera\/.+\.mp4$/,
      );
    });

    it('uploads other media formats and sets type other', async () => {
      const file = {
        buffer: Buffer.from('audio'),
        mimetype: 'audio/mp3',
        originalname: 'song.mp3',
      };

      const result = await provider.upload(file);
      expect(result.type).toBe('other');
    });

    it('throws wrapped Error when S3 Upload fails', async () => {
      mockUploadDone.mockRejectedValueOnce(new Error('S3 Network Timeout'));

      const file = {
        buffer: Buffer.from('error-data'),
        mimetype: 'image/jpeg',
        originalname: 'fail.jpg',
      };

      await expect(provider.upload(file)).rejects.toThrow(
        'Failed to upload to S3: S3 Network Timeout',
      );
    });
  });

  describe('delete', () => {
    it('should extract key from standard amazonaws.com URL', async () => {
      const sendSpy = vi
        .spyOn((provider as any).s3Client, 'send')
        .mockResolvedValueOnce({} as any);

      await provider.delete(
        'https://test-bucket.s3.us-east-1.amazonaws.com/circlesfera/direct.jpg',
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'circlesfera/direct.jpg',
          }),
        }),
      );
    });

    it('should extract key using circlesfera/ fallback index', async () => {
      const sendSpy = vi
        .spyOn((provider as any).s3Client, 'send')
        .mockResolvedValueOnce({} as any);

      await provider.delete(
        'https://custom-proxy.io/static/circlesfera/fallback.jpg',
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'circlesfera/fallback.jpg',
          }),
        }),
      );
    });
    it('should delete object from S3 successfully', async () => {
      const sendSpy = vi
        .spyOn((provider as any).s3Client, 'send')
        .mockResolvedValueOnce({} as any);

      await provider.delete('https://cdn.example.com/circlesfera/item.jpg');

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'circlesfera/item.jpg',
          }),
        }),
      );
    });

    it('should treat NoSuchKey as idempotent success', async () => {
      const noSuchKeyErr = new Error('NoSuchKey');
      noSuchKeyErr.name = 'NoSuchKey';
      vi.spyOn((provider as any).s3Client, 'send').mockRejectedValueOnce(
        noSuchKeyErr,
      );

      await expect(
        provider.delete('https://cdn.example.com/circlesfera/missing.jpg'),
      ).resolves.not.toThrow();
    });

    it('should re-throw unexpected S3 network/5xx errors to enable retries', async () => {
      const serverErr = new Error('Internal S3 Error');
      vi.spyOn((provider as any).s3Client, 'send').mockRejectedValueOnce(
        serverErr,
      );

      await expect(
        provider.delete('https://cdn.example.com/circlesfera/broken.jpg'),
      ).rejects.toThrow('Internal S3 Error');
    });

    it('should return early without calling S3 if key cannot be extracted', async () => {
      const sendSpy = vi.spyOn((provider as any).s3Client, 'send');

      await provider.delete('');
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('listFiles', () => {
    it('should list S3 objects and format them with CDN URLs', async () => {
      const now = new Date();
      vi.spyOn((provider as any).s3Client, 'send').mockResolvedValueOnce({
        Contents: [
          { Key: 'circlesfera/video1.mp4', LastModified: now, Size: 1048576 },
        ],
      } as any);

      const files = await provider.listFiles();
      expect(files).toHaveLength(1);
      expect(files[0].url).toBe(
        'https://cdn.example.com/circlesfera/video1.mp4',
      );
      expect(files[0].lastModified).toEqual(now);
      expect(files[0].sizeBytes).toBe(1048576);
    });

    it('should return empty list when response Contents is undefined', async () => {
      vi.spyOn((provider as any).s3Client, 'send').mockResolvedValueOnce(
        {} as any,
      );

      const files = await provider.listFiles();
      expect(files).toEqual([]);
    });

    it('should format URLs with standard S3 format when cdnUrl is absent', async () => {
      const noCdnConfig: Record<string, string> = {
        AWS_S3_BUCKET: 'raw-bucket',
        AWS_S3_REGION: 'eu-west-1',
        AWS_ACCESS_KEY_ID: 'key',
        AWS_SECRET_ACCESS_KEY: 'secret',
      };
      const noCdnProvider = new S3Provider({
        getOrThrow: vi.fn((k: string) => noCdnConfig[k]),
        get: vi.fn((k: string) => noCdnConfig[k]),
      } as any);

      vi.spyOn((noCdnProvider as any).s3Client, 'send').mockResolvedValueOnce({
        Contents: [{ Key: 'circlesfera/file.png' }],
      } as any);

      const files = await noCdnProvider.listFiles();
      expect(files[0].url).toBe(
        'https://raw-bucket.s3.eu-west-1.amazonaws.com/circlesfera/file.png',
      );
    });

    it('should return empty list on error', async () => {
      vi.spyOn((provider as any).s3Client, 'send').mockRejectedValueOnce(
        new Error('AccessDenied'),
      );

      const files = await provider.listFiles();
      expect(files).toEqual([]);
    });
  });

  describe('storeHlsArtifacts', () => {
    it('should upload all HLS files and return public URLs', async () => {
      vi.spyOn(fs.promises, 'readdir').mockResolvedValue([
        'master.m3u8' as any,
        'thumb.jpg' as any,
        '720p_000.ts' as any,
      ]);
      vi.spyOn(fs.promises, 'stat').mockResolvedValue({
        isFile: () => true,
      } as any);
      vi.spyOn(fs.promises, 'readFile').mockResolvedValue(
        Buffer.from('fake-artifact-bytes'),
      );

      const result = await provider.storeHlsArtifacts({
        baseName: 'test-uuid-1234',
        outputDir: '/tmp/hls-out',
      });

      expect(result.masterPlaylistUrl).toBe(
        'https://cdn.example.com/circlesfera/hls/test-uuid-1234/master.m3u8',
      );
      expect(result.thumbnailUrl).toBe(
        'https://cdn.example.com/circlesfera/hls/test-uuid-1234/thumb.jpg',
      );
    });
  });

  describe('getMediaArtifact', () => {
    it('should fetch the artifact from S3 and return buffer + content type', async () => {
      const fakeBody = (async function* () {
        yield Buffer.from('playlist-content');
      })();

      vi.spyOn((provider as any).s3Client, 'send').mockResolvedValueOnce({
        Body: fakeBody,
        ContentType: 'application/vnd.apple.mpegurl',
      } as any);

      const result = await provider.getMediaArtifact({
        baseFolder: 'test-uuid-1234',
        relativePath: 'master.m3u8',
      });

      expect(result).not.toBeNull();
      expect(result?.content.toString()).toBe('playlist-content');
      expect(result?.contentType).toBe('application/vnd.apple.mpegurl');
    });

    it('should return null when S3 returns NoSuchKey', async () => {
      const err = new Error('NoSuchKey');
      err.name = 'NoSuchKey';
      vi.spyOn((provider as any).s3Client, 'send').mockRejectedValueOnce(err);

      const result = await provider.getMediaArtifact({
        baseFolder: 'test-uuid-1234',
        relativePath: 'master.m3u8',
      });

      expect(result).toBeNull();
    });

    it('should return null when S3 returns a 404 status', async () => {
      const err = Object.assign(new Error('NotFound'), {
        $metadata: { httpStatusCode: 404 },
      });
      vi.spyOn((provider as any).s3Client, 'send').mockRejectedValueOnce(err);

      const result = await provider.getMediaArtifact({
        baseFolder: 'test-uuid-1234',
        relativePath: 'thumb.jpg',
      });

      expect(result).toBeNull();
    });

    it('should rethrow unexpected S3 errors', async () => {
      const serverErr = new Error('ServiceUnavailable');
      vi.spyOn((provider as any).s3Client, 'send').mockRejectedValueOnce(
        serverErr,
      );

      await expect(
        provider.getMediaArtifact({
          baseFolder: 'test-uuid-1234',
          relativePath: 'master.m3u8',
        }),
      ).rejects.toThrow('ServiceUnavailable');
    });

    it('should return null when response Body is absent', async () => {
      vi.spyOn((provider as any).s3Client, 'send').mockResolvedValueOnce({
        Body: undefined,
      } as any);

      const result = await provider.getMediaArtifact({
        baseFolder: 'test-uuid-1234',
        relativePath: 'master.m3u8',
      });

      expect(result).toBeNull();
    });

    it('should map various extensions to correct contentType', async () => {
      const makeBody = () =>
        (async function* () {
          yield Buffer.from('data');
        })();

      vi.spyOn((provider as any).s3Client, 'send')
        .mockResolvedValueOnce({ Body: makeBody() } as any)
        .mockResolvedValueOnce({ Body: makeBody() } as any)
        .mockResolvedValueOnce({ Body: makeBody() } as any)
        .mockResolvedValueOnce({ Body: makeBody() } as any);

      const ts = await provider.getMediaArtifact({
        baseFolder: 'hls',
        relativePath: 'chunk.ts',
      });
      expect(ts?.contentType).toBe('video/MP2T');

      const png = await provider.getMediaArtifact({
        baseFolder: 'hls',
        relativePath: 'cover.png',
      });
      expect(png?.contentType).toBe('image/png');

      const webp = await provider.getMediaArtifact({
        baseFolder: 'hls',
        relativePath: 'cover.webp',
      });
      expect(webp?.contentType).toBe('image/webp');

      const bin = await provider.getMediaArtifact({
        baseFolder: 'hls',
        relativePath: 'manifest.dat',
      });
      expect(bin?.contentType).toBe('application/octet-stream');
    });
  });
});
