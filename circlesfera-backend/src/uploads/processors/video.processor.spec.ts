import * as fs from 'node:fs';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VideoProcessor } from './video.processor.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const existsSyncMock = vi.fn().mockReturnValue(false);
  const mkdirSyncMock = vi.fn().mockReturnValue(undefined);
  const rmSyncMock = vi.fn().mockReturnValue(undefined);
  const statSyncMock = vi.fn().mockReturnValue({ size: 1024 });

  return {
    ...actual,
    default: {
      ...actual,
      existsSync: existsSyncMock,
      mkdirSync: mkdirSyncMock,
      rmSync: rmSyncMock,
      statSync: statSyncMock,
    },
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
    rmSync: rmSyncMock,
    statSync: statSyncMock,
  };
});

let ffmpegEndTrigger: (() => void) | null = null;
let ffmpegErrorTrigger: ((err: Error) => void) | null = null;
let shouldFailThumbnail = false;
let shouldFailTranscode = false;
const thumbnailError = new Error('FFmpeg failed to extract thumbnail');
const transcodeError = new Error('FFmpeg failed to transcode HLS');

const mockFfmpegInstance: any = {
  screenshots: vi.fn(function (this: any) {
    setTimeout(() => {
      if (shouldFailThumbnail) {
        ffmpegErrorTrigger?.(thumbnailError);
      } else {
        ffmpegEndTrigger?.();
      }
    }, 0);
    return this;
  }),
  outputOptions: vi.fn().mockReturnThis(),
  output: vi.fn().mockReturnThis(),
  on: vi.fn(function (this: any, event: string, cb: any) {
    if (event === 'end') {
      ffmpegEndTrigger = cb;
    } else if (event === 'error') {
      ffmpegErrorTrigger = cb;
    }
    return this;
  }),
  run: vi.fn(function (this: any) {
    setTimeout(() => {
      if (shouldFailTranscode) {
        ffmpegErrorTrigger?.(transcodeError);
      } else {
        ffmpegEndTrigger?.();
      }
    }, 0);
    return this;
  }),
};

vi.mock('fluent-ffmpeg', () => {
  const fn = vi.fn((_input: any, _options?: any) => mockFfmpegInstance);
  (fn as any).default = fn;
  return {
    default: fn,
    __esModule: true,
  };
});

describe('VideoProcessor', () => {
  let processor: VideoProcessor;

  const mockPrisma = {
    postMedia: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    story: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    message: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    comment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    profile: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    collection: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    ffmpegEndTrigger = null;
    ffmpegErrorTrigger = null;
    shouldFailThumbnail = false;
    shouldFailTranscode = false;

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(fs.rmSync).mockReturnValue(undefined);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoProcessor,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    processor = module.get<VideoProcessor>(VideoProcessor);
    vi.spyOn((processor as any).logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should reject URLs whose baseName is not a valid UUID v4', async () => {
    const job = {
      id: 'job-1',
      data: {
        url: '/uploads/not-a-valid-uuid.mp4',
        originalname: 'video.mp4',
        userId: 'user-1',
      },
    } as unknown as Job<{
      url: string;
      originalname?: string;
      userId?: string;
    }>;

    await expect(processor.process(job)).rejects.toThrow(
      /is not a valid UUID v4/,
    );
  });

  it('should transcode video, generate master playlist and thumbnail, and update database', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-valid',
      data: {
        url: `/uploads/${validUuid}.mp4`,
        originalname: 'clip.mp4',
        userId: 'user-valid',
      },
    } as unknown as Job<{
      url: string;
      originalname?: string;
      userId?: string;
    }>;

    await processor.process(job);

    expect(mockFfmpegInstance.screenshots).toHaveBeenCalled();
    expect(mockFfmpegInstance.run).toHaveBeenCalled();
    expect(mockPrisma.postMedia.updateMany).toHaveBeenCalledWith({
      where: { url: `/uploads/${validUuid}.mp4` },
      data: {
        standardUrl: `/uploads/${validUuid}/master.m3u8`,
        thumbnailUrl: `/uploads/${validUuid}/thumb.jpg`,
      },
    });
  });

  it('should be idempotent and skip FFmpeg when complete artifacts already exist', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-idempotent',
      data: {
        url: `/uploads/${validUuid}.mp4`,
        userId: 'user-idempotent',
      },
    } as unknown as Job<{
      url: string;
      originalname?: string;
      userId?: string;
    }>;

    // Both master.m3u8 and thumb.jpg exist with size > 0
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 4096 } as any);

    await processor.process(job);

    // FFmpeg is not called!
    expect(mockFfmpegInstance.screenshots).not.toHaveBeenCalled();
    expect(mockFfmpegInstance.run).not.toHaveBeenCalled();

    // Database reconciliation still executes
    expect(mockPrisma.postMedia.updateMany).toHaveBeenCalledWith({
      where: { url: `/uploads/${validUuid}.mp4` },
      data: {
        standardUrl: `/uploads/${validUuid}/master.m3u8`,
        thumbnailUrl: `/uploads/${validUuid}/thumb.jpg`,
      },
    });
  });

  it('should purge dirty directory if previous artifacts were incomplete before transcoding', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-dirty',
      data: {
        url: `/uploads/${validUuid}.mp4`,
        userId: 'user-dirty',
      },
    } as unknown as Job<{
      url: string;
      originalname?: string;
      userId?: string;
    }>;

    // outputDir exists, but artifacts are incomplete
    vi.mocked(fs.existsSync).mockImplementation((targetPath: fs.PathLike) => {
      const p = String(targetPath);
      if (p.endsWith('master.m3u8')) return false;
      if (p.endsWith(validUuid)) return true;
      return false;
    });

    await processor.process(job);

    expect(vi.mocked(fs.rmSync)).toHaveBeenCalledWith(
      expect.stringContaining(validUuid),
      { recursive: true, force: true },
    );
    expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(
      expect.stringContaining(validUuid),
      { recursive: true },
    );
    expect(mockFfmpegInstance.screenshots).toHaveBeenCalled();
  });

  it('should clean up output directory on transcoding failure', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-fail',
      data: {
        url: `/uploads/${validUuid}.mp4`,
        userId: 'user-1',
      },
    } as unknown as Job<{
      url: string;
      originalname?: string;
      userId?: string;
    }>;

    shouldFailThumbnail = true;
    vi.mocked(fs.existsSync).mockImplementation((targetPath: fs.PathLike) => {
      const p = String(targetPath);
      // Fail initially when checking if already transcoded, but return true when cleaning up
      if (p.endsWith('master.m3u8')) return false;
      return true;
    });

    await expect(processor.process(job)).rejects.toThrow(
      'FFmpeg failed to extract thumbnail',
    );
    expect(vi.mocked(fs.rmSync)).toHaveBeenCalledWith(
      expect.stringContaining(validUuid),
      { recursive: true, force: true },
    );
  });
});
