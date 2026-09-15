import * as fs from 'node:fs';
import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
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
      ],
    }).compile();

    service = module.get<UploadsService>(UploadsService);
    provider = module.get(STORAGE_PROVIDER);
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
});
