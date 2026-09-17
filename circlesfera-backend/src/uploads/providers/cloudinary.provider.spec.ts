import { Writable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { v2 as cloudinary } from 'cloudinary';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadedFile } from '../interfaces/uploaded-file.interface.js';
import { CloudinaryProvider } from './cloudinary.provider.js';

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: vi.fn(),
      destroy: vi.fn(),
    },
  },
}));

describe('CloudinaryProvider', () => {
  let provider: CloudinaryProvider;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'CLOUDINARY_NAME') return 'test-cloud';
      if (key === 'CLOUDINARY_API_KEY') return 'test-key';
      if (key === 'CLOUDINARY_API_SECRET') return 'test-secret';
      return null;
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudinaryProvider,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    provider = module.get<CloudinaryProvider>(CloudinaryProvider);
  });

  it('configures cloudinary client in constructor', () => {
    expect(cloudinary.config).toHaveBeenCalledWith({
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
    });
  });

  describe('upload', () => {
    it('uploads video file successfully', async () => {
      const mockFile: UploadedFile = {
        buffer: Buffer.from('video-data'),
        mimetype: 'video/mp4',
        originalname: 'clip.mp4',
      };

      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (
          _options: unknown,
          callback?: (err: unknown, res: unknown) => void,
        ) => {
          const stream = new Writable({
            write(_chunk, _encoding, next) {
              next();
            },
          });
          stream.on('finish', () => {
            callback?.(null, { secure_url: 'https://cloudinary.com/clip.mp4' });
          });
          return stream as unknown as ReturnType<
            typeof cloudinary.uploader.upload_stream
          >;
        },
      );

      const result = await provider.upload(mockFile);
      expect(result).toEqual({
        url: 'https://cloudinary.com/clip.mp4',
        type: 'video',
      });
    });

    it('uploads audio file successfully', async () => {
      const mockFile: UploadedFile = {
        buffer: Buffer.from('audio-data'),
        mimetype: 'audio/mp3',
        originalname: 'sound.mp3',
      };

      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (
          _options: unknown,
          callback?: (err: unknown, res: unknown) => void,
        ) => {
          const stream = new Writable({
            write(_chunk, _encoding, next) {
              next();
            },
          });
          stream.on('finish', () => {
            callback?.(null, {
              secure_url: 'https://cloudinary.com/sound.mp3',
            });
          });
          return stream as unknown as ReturnType<
            typeof cloudinary.uploader.upload_stream
          >;
        },
      );

      const result = await provider.upload(mockFile);
      expect(result).toEqual({
        url: 'https://cloudinary.com/sound.mp3',
        type: 'audio',
      });
    });

    it('uploads image file successfully', async () => {
      const mockFile: UploadedFile = {
        buffer: Buffer.from('image-data'),
        mimetype: 'image/jpeg',
        originalname: 'pic.jpg',
      };

      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (
          _options: unknown,
          callback?: (err: unknown, res: unknown) => void,
        ) => {
          const stream = new Writable({
            write(_chunk, _encoding, next) {
              next();
            },
          });
          stream.on('finish', () => {
            callback?.(null, { secure_url: 'https://cloudinary.com/pic.webp' });
          });
          return stream as unknown as ReturnType<
            typeof cloudinary.uploader.upload_stream
          >;
        },
      );

      const result = await provider.upload(mockFile);
      expect(result).toEqual({
        url: 'https://cloudinary.com/pic.webp',
        type: 'image',
      });
    });

    it('rejects when upload_stream emits error', async () => {
      const mockFile: UploadedFile = {
        buffer: Buffer.from('error-data'),
        mimetype: 'image/png',
        originalname: 'error.png',
      };

      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (
          _options: unknown,
          callback?: (err: unknown, res: unknown) => void,
        ) => {
          const stream = new Writable({
            write(_chunk, _encoding, next) {
              next();
            },
          });
          stream.on('finish', () => {
            callback?.(new Error('Cloudinary stream error'), null);
          });
          return stream as unknown as ReturnType<
            typeof cloudinary.uploader.upload_stream
          >;
        },
      );

      await expect(provider.upload(mockFile)).rejects.toThrow(
        'Cloudinary stream error',
      );
    });
  });

  describe('delete', () => {
    it('deletes file successfully when result is ok', async () => {
      vi.mocked(cloudinary.uploader.destroy).mockResolvedValueOnce({
        result: 'ok',
      });

      await provider.delete(
        'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg',
      );
      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
        'circlesfera/sample',
      );
    });

    it('deletes file successfully when result is not found', async () => {
      vi.mocked(cloudinary.uploader.destroy).mockResolvedValueOnce({
        result: 'not found',
      });

      await provider.delete(
        'https://res.cloudinary.com/demo/image/upload/v1/missing.jpg',
      );
      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
        'circlesfera/missing',
      );
    });

    it('throws error when deletion returns unexpected result', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      vi.mocked(cloudinary.uploader.destroy).mockResolvedValueOnce({
        result: 'unauthorized',
      });

      await expect(
        provider.delete(
          'https://res.cloudinary.com/demo/image/upload/v1/forbidden.jpg',
        ),
      ).rejects.toThrow('Cloudinary deletion failed with result: unauthorized');

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
