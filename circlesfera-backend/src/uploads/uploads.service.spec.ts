import * as fs from 'node:fs';
import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { OutboxService } from '../outbox/outbox.service.js';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface.js';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';
import { MediaProcessorService } from './media-processor.service.js';
import { MediaSignatureValidator } from './media-signature.validator.js';
import { LocalStorageProvider } from './providers/local.provider.js';
import { UploadsService } from './uploads.service.js';

// Mock Sharp to handle both default import and requirement types
vi.mock('sharp', () => {
  const sharpMock: any = {
    toBuffer: vi.fn(),
  };
  sharpMock.resize = vi.fn(() => sharpMock);
  sharpMock.webp = vi.fn(() => sharpMock);
  sharpMock.toBuffer.mockResolvedValue(Buffer.from('optimized'));

  const sharpFn = vi.fn(() => sharpMock);
  (sharpFn as any).default = sharpFn;

  return {
    default: sharpFn,
    __esModule: true,
  };
});

const mockConfigService = {
  get: vi.fn((key: string) => {
    if (key === 'BASE_URL') return 'http://localhost:3000';
    if (key === 'CLOUDINARY_NAME') return null;
    return null;
  }),
};

const mockMediaProcessor = {
  process: vi.fn((file: UploadedFile) =>
    Promise.resolve({
      original: { buffer: file.buffer, mimetype: file.mimetype },
      standard: { buffer: file.buffer, mimetype: file.mimetype },
      thumbnail: { buffer: file.buffer, mimetype: file.mimetype },
    }),
  ),
};

const mockVideoQueue = {
  add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  getWaitingCount: vi.fn().mockResolvedValue(0),
  getActiveCount: vi.fn().mockResolvedValue(0),
  getJobs: vi.fn().mockResolvedValue([]),
};

const mockMediaCleanupQueue = {
  add: vi.fn().mockResolvedValue({ id: 'job-clean-1' }),
};

const mockOutboxService = {
  enqueue: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
};

describe('UploadsService', () => {
  let service: UploadsService;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVideoQueue.getWaitingCount.mockResolvedValue(0);
    mockVideoQueue.getActiveCount.mockResolvedValue(0);
    mockVideoQueue.getJobs.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MediaProcessorService,
          useValue: mockMediaProcessor,
        },
        {
          provide: MediaSignatureValidator,
          useValue: { validate: vi.fn().mockResolvedValue(undefined) },
        },
        {
          provide: STORAGE_PROVIDER,
          useFactory: (_config: ConfigService) => new LocalStorageProvider(),
          inject: [ConfigService],
        },
        { provide: 'BullQueue_video-transcoding', useValue: mockVideoQueue },
        { provide: 'BullQueue_media-cleanup', useValue: mockMediaCleanupQueue },
        { provide: OutboxService, useValue: mockOutboxService },
      ],
    }).compile();

    service = module.get<UploadsService>(UploadsService);
    provider = module.get(STORAGE_PROVIDER);
    vi.spyOn((service as any).logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('LocalStorageProvider', () => {
    const testFile: UploadedFile = {
      originalname: 'test.png',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-image-content'),
    };

    it('should upload a file and return url and type', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);

      const result = await provider.upload(testFile);

      expect(result.url).toContain('/uploads/');
      expect(result.url).toContain('.png');
      expect(result.type).toBe('image');
      expect(fs.promises.writeFile).toHaveBeenCalled();
    });
  });

  describe('Video Admission Control and Quotas', () => {
    const videoFile: UploadedFile = {
      originalname: 'clip.mp4',
      mimetype: 'video/mp4',
      buffer: Buffer.from('fake-video-bytes'),
    };

    it('should allow video upload and enqueue with resilient options and userId', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);

      const result = await service.uploadFile(videoFile, 'user-abc');

      expect(result.url).toContain('/uploads/');
      expect(result.type).toBe('video');
      expect(mockVideoQueue.add).toHaveBeenCalledTimes(1);
      expect(mockVideoQueue.add).toHaveBeenCalledWith(
        'transcode',
        expect.objectContaining({
          url: result.url,
          originalname: 'clip.mp4',
          userId: 'user-abc',
        }),
        expect.objectContaining({
          jobId: expect.stringMatching(/^transcode:.+$/),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 100, age: 24 * 3600 },
          removeOnFail: { count: 100, age: 7 * 24 * 3600 },
        }),
      );
    });

    it('should reject video upload with 503 when global queue backlog is saturated', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      mockVideoQueue.getWaitingCount.mockResolvedValue(15);
      mockVideoQueue.getActiveCount.mockResolvedValue(5); // total = 20 >= default 20

      await expect(service.uploadFile(videoFile, 'user-abc')).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(mockVideoQueue.add).not.toHaveBeenCalled();
    });

    it('should reject video upload with 429 when user concurrent quota is exceeded', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      mockVideoQueue.getWaitingCount.mockResolvedValue(2);
      mockVideoQueue.getActiveCount.mockResolvedValue(1);
      mockVideoQueue.getJobs.mockResolvedValue([
        { data: { userId: 'user-abc' } },
        { data: { userId: 'user-abc' } },
      ]);

      const promise = service.uploadFile(videoFile, 'user-abc');
      await expect(promise).rejects.toThrow(HttpException);

      try {
        await promise;
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }

      expect(mockVideoQueue.add).not.toHaveBeenCalled();
    });

    it('should allow video upload when other users have active jobs but current user is within quota', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      mockVideoQueue.getWaitingCount.mockResolvedValue(2);
      mockVideoQueue.getActiveCount.mockResolvedValue(1);
      mockVideoQueue.getJobs.mockResolvedValue([
        { data: { userId: 'other-user-1' } },
        { data: { userId: 'other-user-2' } },
      ]);

      const result = await service.uploadFile(videoFile, 'user-abc');
      expect(result.url).toBeDefined();
      expect(mockVideoQueue.add).toHaveBeenCalledTimes(1);
    });

    it('should bypass video admission control for image uploads', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      mockVideoQueue.getWaitingCount.mockResolvedValue(25); // saturated queue

      const imageFile: UploadedFile = {
        originalname: 'photo.png',
        mimetype: 'image/png',
        buffer: Buffer.from('fake-image-bytes'),
      };

      const result = await service.uploadFile(imageFile, 'user-abc');
      expect(result.url).toBeDefined();
      expect(mockVideoQueue.getWaitingCount).not.toHaveBeenCalled();
      expect(mockVideoQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('LocalStorageProvider Deletion and Listing', () => {
    it('should delete file successfully when it exists', async () => {
      const unlinkSpy = vi
        .spyOn(fs.promises, 'unlink')
        .mockResolvedValue(undefined);

      await provider.delete('/uploads/photo.jpg');
      expect(unlinkSpy).toHaveBeenCalled();
    });

    it('should handle ENOENT gracefully as idempotent delete', async () => {
      const err: any = new Error('File not found');
      err.code = 'ENOENT';
      vi.spyOn(fs.promises, 'unlink').mockRejectedValue(err);

      await expect(
        provider.delete('/uploads/missing.jpg'),
      ).resolves.not.toThrow();
    });

    it('should re-throw unexpected disk/permission errors to trigger retries', async () => {
      const err: any = new Error('Disk I/O error');
      err.code = 'EIO';
      vi.spyOn(fs.promises, 'unlink').mockRejectedValue(err);

      await expect(provider.delete('/uploads/photo.jpg')).rejects.toThrow(
        'Disk I/O error',
      );
    });

    it('should list files with timestamps and sizes, ignoring hidden files', async () => {
      vi.spyOn(fs.promises, 'readdir').mockResolvedValue([
        '.startup-test' as any,
        'image1.png' as any,
        'image2.webp' as any,
      ]);
      vi.spyOn(fs.promises, 'stat').mockResolvedValue({
        isFile: () => true,
        mtime: new Date('2026-09-01T12:00:00Z'),
        size: 2048,
      } as any);

      const files = await provider.listFiles();
      expect(files).toHaveLength(2);
      expect(files[0].url).toBe('/uploads/image1.png');
      expect(files[0].sizeBytes).toBe(2048);
      expect(files[1].url).toBe('/uploads/image2.webp');
    });
  });

  describe('Durable Media Deletion Workflow', () => {
    it('should enqueue deletion into BullMQ media-cleanup queue with exponential backoff', async () => {
      await service.scheduleMediaDeletion([
        '/uploads/a.jpg',
        '/uploads/b.jpg',
        '/uploads/a.jpg', // duplicate
      ]);

      expect(mockMediaCleanupQueue.add).toHaveBeenCalledTimes(1);
      expect(mockMediaCleanupQueue.add).toHaveBeenCalledWith(
        'delete-media-batch',
        { mediaUrls: ['/uploads/a.jpg', '/uploads/b.jpg'] },
        expect.objectContaining({
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
        }),
      );
    });

    it('should enqueue deletion via OutboxService when a Prisma transaction is provided', async () => {
      const mockTx = { dummy: true } as any;

      await service.scheduleMediaDeletion(['/uploads/tx.png'], { tx: mockTx });

      expect(mockOutboxService.enqueue).toHaveBeenCalledTimes(1);
      expect(mockOutboxService.enqueue).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          queueName: 'media-cleanup',
          eventName: 'delete-media-batch',
          payload: { mediaUrls: ['/uploads/tx.png'] },
          options: expect.objectContaining({
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 },
          }),
        }),
      );
      expect(mockMediaCleanupQueue.add).not.toHaveBeenCalled();
    });

    it('should handle empty or whitespace URLs without enqueueing', async () => {
      await service.scheduleMediaDeletion(['', '   ']);
      expect(mockMediaCleanupQueue.add).not.toHaveBeenCalled();
      expect(mockOutboxService.enqueue).not.toHaveBeenCalled();
    });

    it('should route media.delete_batch domain events through scheduleMediaDeletion', async () => {
      await service.handleMediaDeleteBatch({
        mediaUrls: ['/uploads/event-file.png'],
      });

      expect(mockMediaCleanupQueue.add).toHaveBeenCalledWith(
        'delete-media-batch',
        { mediaUrls: ['/uploads/event-file.png'] },
        expect.anything(),
      );
    });
  });
});
