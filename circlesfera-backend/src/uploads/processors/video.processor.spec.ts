import * as fs from 'node:fs';
import * as path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { ffprobe, runFfmpeg } from '../../common/media/ffmpeg-runner.js';
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

let shouldFailThumbnail = false;
let shouldFailTranscode = false;
let shouldHangThumbnail = false;
let shouldHangTranscode = false;
const thumbnailError = new Error('FFmpeg failed to extract thumbnail');
const transcodeError = new Error('FFmpeg failed to transcode HLS');

// The programs are replaced: what they are asked is recorded, and each run
// ends as the test says. A run that hangs ends only when its time is up, as
// the real runner does when it kills the program.
vi.mock('../../common/media/ffmpeg-runner.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../common/media/ffmpeg-runner.js')
    >();
  return {
    ...actual,
    ffprobe: vi.fn(async () => ({
      format: { duration: '10.000000' },
      streams: [
        {
          codec_type: 'video',
          width: 1280,
          height: 720,
          duration: '10.000000',
        },
      ],
    })),
    runFfmpeg: vi.fn(
      (args: readonly string[], options: { signal?: AbortSignal } = {}) => {
        const thumbnail = args.includes('-vframes');
        const hangs = thumbnail ? shouldHangThumbnail : shouldHangTranscode;
        const fails = thumbnail ? shouldFailThumbnail : shouldFailTranscode;
        if (hangs) {
          return new Promise<void>((_resolve, reject) => {
            options.signal?.addEventListener('abort', () =>
              reject(options.signal?.reason),
            );
          });
        }
        return fails
          ? Promise.reject(thumbnail ? thumbnailError : transcodeError)
          : Promise.resolve();
      },
    ),
  };
});

const thumbnailRuns = () =>
  vi.mocked(runFfmpeg).mock.calls.filter(([args]) => args.includes('-vframes'));
const transcodeRuns = () =>
  vi
    .mocked(runFfmpeg)
    .mock.calls.filter(([args]) => !args.includes('-vframes'));

describe('VideoProcessor', () => {
  let processor: VideoProcessor;

  const mockPrisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'user-1',
        isActive: true,
        isRootBanned: false,
        profiles: [],
      }),
    },
    postMedia: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    story: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    message: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    comment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    profile: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    collection: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    media: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    shouldFailThumbnail = false;
    shouldFailTranscode = false;
    shouldHangThumbnail = false;
    shouldHangTranscode = false;

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

  it('should reject unknown job names with UnrecoverableError', async () => {
    const job = {
      id: 'job-unknown',
      name: 'unknown-job',
      data: { url: '/uploads/file.mp4' },
    } as unknown as Job<{ url: string }>;

    await expect(processor.process(job)).rejects.toThrow(
      'Unknown job name in video-transcoding queue: unknown-job',
    );
  });

  it('should reject missing url with UnrecoverableError', async () => {
    const job = {
      id: 'job-no-url',
      name: 'transcode',
      data: {},
    } as unknown as Job<{ url: string }>;

    await expect(processor.process(job)).rejects.toThrow(
      'Missing url for video transcoding',
    );
  });

  it('should abort transcoding when userId belongs to an inactive or banned user', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'banned-user',
      isActive: false,
      isRootBanned: true,
      profiles: [],
    });

    const job = {
      id: 'job-banned',
      name: 'transcode',
      data: {
        url: '/uploads/a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d.mp4',
        userId: 'banned-user',
      },
    } as unknown as Job<{ url: string; userId?: string }>;

    await processor.process(job);

    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it('should abort transcoding when the user is active but their profile is banned', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-with-banned-profile',
      isActive: true,
      isRootBanned: false,
      profiles: [{ isAccountBanned: true, suspendedUntil: null }],
    });

    const job = {
      id: 'job-profile-banned',
      name: 'transcode',
      data: {
        url: '/uploads/a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d.mp4',
        userId: 'user-with-banned-profile',
      },
    } as unknown as Job<{ url: string; userId?: string }>;

    await processor.process(job);

    expect(fs.mkdirSync).not.toHaveBeenCalled();
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

  it('handles remote HTTP url by passing url directly to ffmpeg input', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-remote',
      name: 'transcode',
      data: {
        url: `https://cdn.example.com/videos/${validUuid}.mp4`,
      },
    } as unknown as Job<{ url: string }>;

    await processor.process(job);
    const remote = `https://cdn.example.com/videos/${validUuid}.mp4`;
    expect(ffprobe).toHaveBeenCalledWith(remote, expect.anything());
    expect(thumbnailRuns()[0][0].slice(0, 4)).toEqual([
      '-ss',
      '1',
      '-i',
      remote,
    ]);
    expect(transcodeRuns()[0][0].slice(0, 2)).toEqual(['-i', remote]);
  });

  // The exact arguments each program is started with, as the processor
  // had them when it built them through a command builder.
  it('starts ffmpeg with the same arguments as before for the thumbnail and the stream', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-argv',
      data: { url: `/uploads/${validUuid}.mp4` },
    } as unknown as Job<{ url: string }>;
    const input = path.join(process.cwd(), `/uploads/${validUuid}.mp4`);
    const outputDir = path.join(process.cwd(), 'uploads', validUuid);

    await processor.process(job);

    // The length is read first: the image is taken at 10% of it.
    expect(ffprobe).toHaveBeenCalledWith(input, {
      signal: expect.any(AbortSignal),
    });
    expect(vi.mocked(runFfmpeg).mock.calls.map(([args]) => args)).toEqual([
      [
        '-ss',
        '1',
        '-i',
        input,
        '-y',
        '-filter_complex',
        'scale=w=300:h=trunc(ow/a/2)*2[size0];[size0]split=1[screen0]',
        '-vframes',
        '1',
        '-map',
        '[screen0]',
        path.join(outputDir, 'thumb.jpg'),
      ],
      [
        '-i',
        input,
        '-y',
        '-profile:v',
        'main',
        '-vf',
        'scale=w=-2:h=720',
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-b:a',
        '128k',
        '-c:v',
        'h264',
        '-crf',
        '20',
        '-g',
        '48',
        '-keyint_min',
        '48',
        '-sc_threshold',
        '0',
        '-b:v',
        '2500k',
        '-maxrate',
        '2675k',
        '-bufsize',
        '3750k',
        '-hls_time',
        '4',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_filename',
        path.join(outputDir, '720p_%03d.ts'),
        path.join(outputDir, 'master.m3u8'),
      ],
    ]);
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

    expect(thumbnailRuns()).toHaveLength(1);
    expect(transcodeRuns()).toHaveLength(1);
    expect(mockPrisma.postMedia.updateMany).toHaveBeenCalledWith({
      where: { url: `/uploads/${validUuid}.mp4`, coverTimeMs: null },
      data: {
        standardUrl: `/uploads/${validUuid}/master.m3u8`,
        thumbnailUrl: `/uploads/${validUuid}/thumb.jpg`,
      },
    });
    // A frame whose author chose its cover gets the stream and keeps the
    // cover.
    expect(mockPrisma.postMedia.updateMany).toHaveBeenCalledWith({
      where: { url: `/uploads/${validUuid}.mp4`, coverTimeMs: { not: null } },
      data: { standardUrl: `/uploads/${validUuid}/master.m3u8` },
    });
    expect(mockPrisma.media.updateMany).toHaveBeenCalledWith({
      where: {
        url: `/uploads/${validUuid}.mp4`,
        postMedia: { some: { coverTimeMs: { not: null } } },
      },
      data: {
        status: 'READY',
        standardUrl: `/uploads/${validUuid}/master.m3u8`,
        failedAt: null,
        failureReason: null,
      },
    });
  });

  // `master.m3u8` is named like an HLS master (variant) playlist, which
  // conventionally implies multiple bitrate/resolution renditions a player
  // can switch between. This asserts the actual, narrower contract — exactly
  // one 720p rendition, no adaptive bitrate ladder — so a future change
  // adding real multi-rendition output is a deliberate, visible edit to this
  // test rather than a silent contract change.
  it('produces exactly one 720p rendition, not an adaptive bitrate ladder', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abd';
    const job = {
      id: 'job-single-rendition',
      data: { url: `/uploads/${validUuid}.mp4` },
    } as unknown as Job<{ url: string }>;

    await processor.process(job);

    expect(transcodeRuns()).toHaveLength(1);
    const [args] = transcodeRuns()[0];
    // One video filter and one output: the playlist, last.
    expect(args.filter((arg) => arg === '-vf')).toHaveLength(1);
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=w=-2:h=720');
    expect(args.filter((arg) => arg.endsWith('.m3u8'))).toEqual([args.at(-1)]);
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
    expect(ffprobe).not.toHaveBeenCalled();
    expect(runFfmpeg).not.toHaveBeenCalled();

    // Database reconciliation still executes
    expect(mockPrisma.postMedia.updateMany).toHaveBeenCalledWith({
      where: { url: `/uploads/${validUuid}.mp4`, coverTimeMs: null },
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
    expect(thumbnailRuns()).toHaveLength(1);
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

  it('should delegate HLS artifact storage to injected StorageProvider and update DB with provider URLs', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const mockStorageProvider = {
      upload: vi.fn(),
      delete: vi.fn(),
      storeHlsArtifacts: vi.fn().mockResolvedValue({
        masterPlaylistUrl: `https://cdn.example.com/circlesfera/hls/${validUuid}/master.m3u8`,
        thumbnailUrl: `https://cdn.example.com/circlesfera/hls/${validUuid}/thumb.jpg`,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoProcessor,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: 'STORAGE_PROVIDER',
          useValue: mockStorageProvider,
        },
      ],
    }).compile();

    const procWithStorage = module.get<VideoProcessor>(VideoProcessor);

    const job = {
      id: 'job-storage',
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

    await procWithStorage.process(job);

    expect(mockStorageProvider.storeHlsArtifacts).toHaveBeenCalledWith({
      baseName: validUuid,
      outputDir: expect.stringContaining(validUuid),
    });

    expect(mockPrisma.postMedia.updateMany).toHaveBeenCalledWith({
      where: { url: `/uploads/${validUuid}.mp4`, coverTimeMs: null },
      data: {
        standardUrl: `https://cdn.example.com/circlesfera/hls/${validUuid}/master.m3u8`,
        thumbnailUrl: `https://cdn.example.com/circlesfera/hls/${validUuid}/thumb.jpg`,
      },
    });
  });

  it('handles transcode failure and cleans up output directory', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-transcode-fail',
      data: {
        url: `/uploads/${validUuid}.mp4`,
        userId: 'user-1',
      },
    } as unknown as Job<{
      url: string;
      originalname?: string;
      userId?: string;
    }>;

    shouldFailTranscode = true;
    vi.mocked(fs.existsSync).mockImplementation((targetPath: fs.PathLike) => {
      const p = String(targetPath);
      if (p.endsWith('master.m3u8')) return false;
      return true;
    });

    await expect(processor.process(job)).rejects.toThrow(
      'FFmpeg failed to transcode HLS',
    );
  });

  it('marks the matching Media row READY on successful transcode', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-media-ready',
      data: {
        url: `/uploads/${validUuid}.mp4`,
        userId: 'user-1',
      },
    } as unknown as Job<{ url: string; userId?: string }>;

    await processor.process(job);

    expect(mockPrisma.media.updateMany).toHaveBeenCalledWith({
      where: {
        url: `/uploads/${validUuid}.mp4`,
        NOT: { postMedia: { some: { coverTimeMs: { not: null } } } },
      },
      data: {
        status: 'READY',
        standardUrl: `/uploads/${validUuid}/master.m3u8`,
        thumbnailUrl: `/uploads/${validUuid}/thumb.jpg`,
        failedAt: null,
        failureReason: null,
      },
    });
  });

  it('logs and continues when syncing Media status to READY fails', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-media-ready-sync-error',
      data: {
        url: `/uploads/${validUuid}.mp4`,
        userId: 'user-1',
      },
    } as unknown as Job<{ url: string; userId?: string }>;

    mockPrisma.media.updateMany.mockRejectedValueOnce(new Error('DB down'));
    const warnSpy = vi
      .spyOn((processor as any).logger, 'warn')
      .mockImplementation(() => {});

    await expect(processor.process(job)).resolves.not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to sync Media status to READY'),
    );
  });

  it('marks the matching Media row FAILED when the final retry attempt fails', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-media-failed-final',
      data: {
        url: `/uploads/${validUuid}.mp4`,
        userId: 'user-1',
      },
      opts: { attempts: 3 },
      attemptsMade: 2, // this is the 3rd and last allowed attempt
    } as unknown as Job<{ url: string; userId?: string }>;

    shouldFailTranscode = true;
    vi.mocked(fs.existsSync).mockImplementation((targetPath: fs.PathLike) => {
      const p = String(targetPath);
      if (p.endsWith('master.m3u8')) return false;
      return true;
    });

    await expect(processor.process(job)).rejects.toThrow();

    expect(mockPrisma.media.updateMany).toHaveBeenCalledWith({
      where: { url: `/uploads/${validUuid}.mp4` },
      data: {
        status: 'FAILED',
        failedAt: expect.any(Date),
        failureReason: expect.stringContaining(
          'FFmpeg failed to transcode HLS',
        ),
      },
    });
  });

  it('logs and continues when syncing Media status to FAILED fails', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-media-failed-sync-error',
      data: {
        url: `/uploads/${validUuid}.mp4`,
        userId: 'user-1',
      },
      opts: { attempts: 3 },
      attemptsMade: 2,
    } as unknown as Job<{ url: string; userId?: string }>;

    shouldFailTranscode = true;
    vi.mocked(fs.existsSync).mockImplementation((targetPath: fs.PathLike) => {
      const p = String(targetPath);
      if (p.endsWith('master.m3u8')) return false;
      return true;
    });
    mockPrisma.media.updateMany.mockRejectedValueOnce(new Error('DB down'));
    const warnSpy = vi
      .spyOn((processor as any).logger, 'warn')
      .mockImplementation(() => {});

    // The original transcode error still propagates — a secondary failure
    // recording the Media status must not mask it.
    await expect(processor.process(job)).rejects.toThrow(
      'FFmpeg failed to transcode HLS',
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to sync Media status to FAILED'),
    );
  });

  it('does not mark the Media row FAILED while retry attempts remain', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-media-failed-retry',
      data: {
        url: `/uploads/${validUuid}.mp4`,
        userId: 'user-1',
      },
      opts: { attempts: 3 },
      attemptsMade: 0, // first attempt — two retries remain
    } as unknown as Job<{ url: string; userId?: string }>;

    shouldFailTranscode = true;
    vi.mocked(fs.existsSync).mockImplementation((targetPath: fs.PathLike) => {
      const p = String(targetPath);
      if (p.endsWith('master.m3u8')) return false;
      return true;
    });

    await expect(processor.process(job)).rejects.toThrow();

    expect(mockPrisma.media.updateMany).not.toHaveBeenCalled();
  });

  it('marks the matching Media row FAILED on UnrecoverableError even with retry attempts remaining', async () => {
    // BullMQ never retries an UnrecoverableError regardless of attemptsMade,
    // so this is a final state as soon as it's thrown — unlike a transient
    // transcode failure, it must not wait for attemptsMade to catch up.
    const job = {
      id: 'job-unrecoverable-invalid-uuid',
      data: {
        url: '/uploads/not-a-valid-uuid.mp4',
        userId: 'user-1',
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as unknown as Job<{ url: string; userId?: string }>;

    await expect(processor.process(job)).rejects.toThrow(
      /is not a valid UUID v4/,
    );

    expect(mockPrisma.media.updateMany).toHaveBeenCalledWith({
      where: { url: '/uploads/not-a-valid-uuid.mp4' },
      data: {
        status: 'FAILED',
        failedAt: expect.any(Date),
        failureReason: expect.stringContaining('is not a valid UUID v4'),
      },
    });
  });

  it('handles statSync exception when checking if already transcoded', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-stat-fail',
      data: {
        url: `/uploads/${validUuid}.mp4`,
        userId: 'user-1',
      },
    } as unknown as Job<{
      url: string;
      originalname?: string;
      userId?: string;
    }>;

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('Disk stat error');
    });

    await processor.process(job);
    expect(thumbnailRuns()).toHaveLength(1);
  });

  it('handles staging cleanup failure gracefully when storeHlsArtifacts returns remote URL', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const mockStorageProvider = {
      upload: vi.fn(),
      delete: vi.fn(),
      storeHlsArtifacts: vi.fn().mockResolvedValue({
        masterPlaylistUrl: `https://cdn.example.com/circlesfera/hls/${validUuid}/master.m3u8`,
        thumbnailUrl: `https://cdn.example.com/circlesfera/hls/${validUuid}/thumb.jpg`,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoProcessor,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: 'STORAGE_PROVIDER',
          useValue: mockStorageProvider,
        },
      ],
    }).compile();

    const procWithStorage = module.get<VideoProcessor>(VideoProcessor);
    vi.spyOn(fs.promises, 'rm').mockRejectedValueOnce(
      new Error('Permission denied on rm'),
    );

    const job = {
      id: 'job-storage-cleanup-fail',
      data: {
        url: `/uploads/${validUuid}.mp4`,
      },
    } as unknown as Job<{ url: string }>;

    await expect(procWithStorage.process(job)).resolves.not.toThrow();
  });

  it('handles failure when rmSync throws during failure cleanup', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-double-fail',
      data: {
        url: `/uploads/${validUuid}.mp4`,
      },
    } as unknown as Job<{ url: string }>;

    shouldFailThumbnail = true;
    vi.mocked(fs.existsSync).mockImplementation((targetPath: fs.PathLike) => {
      const p = String(targetPath);
      if (p.endsWith('master.m3u8')) return false;
      return true;
    });
    vi.mocked(fs.rmSync)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('rmSync failed');
      });

    await expect(processor.process(job)).rejects.toThrow(
      'FFmpeg failed to extract thumbnail',
    );
  });

  it('times out if thumbnail extraction exceeds 300s', async () => {
    vi.useFakeTimers();
    shouldHangThumbnail = true;
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-thumb-timeout',
      data: { url: `/uploads/${validUuid}.mp4` },
    } as unknown as Job<{ url: string }>;

    const processPromise = processor.process(job);
    const rejectionExpectation = expect(processPromise).rejects.toThrow(
      /Thumbnail extraction timed out after 300s/,
    );
    await vi.advanceTimersByTimeAsync(300_001);

    await rejectionExpectation;
    // The run was told to stop: the runner kills the program then.
    const [, options] = thumbnailRuns()[0];
    expect(options?.signal?.aborted).toBe(true);
    expect(transcodeRuns()).toHaveLength(0);
    vi.useRealTimers();
  });

  it('times out when reading the length of the video for its thumbnail hangs', async () => {
    vi.useFakeTimers();
    vi.mocked(ffprobe).mockImplementationOnce(
      (_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(options.signal?.reason),
          );
        }),
    );
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-probe-timeout',
      data: { url: `/uploads/${validUuid}.mp4` },
    } as unknown as Job<{ url: string }>;

    const processPromise = processor.process(job);
    const rejectionExpectation = expect(processPromise).rejects.toThrow(
      /Thumbnail extraction timed out after 300s/,
    );
    await vi.advanceTimersByTimeAsync(300_001);

    await rejectionExpectation;
    expect(runFfmpeg).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('times out if HLS transcoding exceeds 300s', async () => {
    vi.useFakeTimers();
    shouldHangTranscode = true;
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-transcode-timeout',
      data: { url: `/uploads/${validUuid}.mp4` },
    } as unknown as Job<{ url: string }>;

    const processPromise = processor.process(job);
    const rejectionExpectation = expect(processPromise).rejects.toThrow(
      /HLS transcoding timed out after 300s/,
    );
    await vi.advanceTimersByTimeAsync(300_001);

    await rejectionExpectation;
    const [, options] = transcodeRuns()[0];
    expect(options?.signal?.aborted).toBe(true);
    // A run stopped by the time limit is not reported as an ffmpeg error.
    expect((processor as any).logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining('FFMPEG Error'),
    );
    vi.useRealTimers();
  });

  it('reports an ffmpeg error of the stream in the log', async () => {
    shouldFailTranscode = true;
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const job = {
      id: 'job-transcode-error-log',
      data: { url: `/uploads/${validUuid}.mp4` },
    } as unknown as Job<{ url: string }>;

    await expect(processor.process(job)).rejects.toThrow(transcodeError);
    expect((processor as any).logger.error).toHaveBeenCalledWith(
      'FFMPEG Error: FFmpeg failed to transcode HLS',
    );
  });
});
