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
import { StoredFilesService } from './services/stored-files.service.js';
import { UploadsService } from './uploads.service.js';
import { VoiceNoteConverter } from './voice-note.converter.js';

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
  getJob: vi.fn(),
};

const mockMediaCleanupQueue = {
  add: vi.fn().mockResolvedValue({ id: 'job-clean-1' }),
};

const mockVoiceNoteConverter = {
  isRecordedVoice: vi.fn(
    (mime: string) => mime === 'audio/webm' || mime === 'audio/mp4',
  ),
  toM4a: vi.fn().mockResolvedValue(Buffer.from('converted-voice')),
};

const mockOutboxService = {
  enqueue: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
};

const mockStoredFiles = {
  record: vi.fn().mockResolvedValue(undefined),
  forget: vi.fn().mockResolvedValue(undefined),
  release: vi.fn().mockResolvedValue([]),
  erasableWith: vi.fn().mockResolvedValue([]),
  ownersOf: vi.fn().mockResolvedValue(new Map()),
  assertOwnedBy: vi.fn().mockResolvedValue(undefined),
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
        { provide: VoiceNoteConverter, useValue: mockVoiceNoteConverter },
        { provide: StoredFilesService, useValue: mockStoredFiles },
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

  describe('the painted layer of a video story', () => {
    it('is joined by one job per story, retried as other video jobs', async () => {
      await service.enqueueStoryOverlay('story-1');

      expect(mockVideoQueue.add).toHaveBeenCalledWith(
        'story-overlay',
        { storyId: 'story-1' },
        expect.objectContaining({
          jobId: expect.stringContaining('story-1'),
          attempts: 3,
        }),
      );
    });

    it('gets its join again when the job was lost or turned down as unknown, and only then', async () => {
      mockVideoQueue.getJob.mockResolvedValueOnce(undefined);
      await expect(service.recoverStoryOverlay('s-1')).resolves.toBe('added');
      expect(mockVideoQueue.add).toHaveBeenCalledWith(
        'story-overlay',
        { storyId: 's-1' },
        expect.anything(),
      );

      const turnedDown = {
        isFailed: vi.fn().mockResolvedValue(true),
        failedReason:
          'Unknown job name in video-transcoding queue: story-overlay',
        retry: vi.fn(),
      };
      mockVideoQueue.getJob.mockResolvedValueOnce(turnedDown);
      await expect(service.recoverStoryOverlay('s-1')).resolves.toBe('retried');
      expect(turnedDown.retry).toHaveBeenCalledWith('failed');

      // A join that failed on its own, or one still on its way, is left.
      for (const job of [
        { ...turnedDown, failedReason: 'ffmpeg exited with code 1' },
        { ...turnedDown, isFailed: vi.fn().mockResolvedValue(false) },
      ]) {
        job.retry = vi.fn();
        mockVideoQueue.getJob.mockResolvedValueOnce(job);
        await expect(service.recoverStoryOverlay('s-1')).resolves.toBe('left');
        expect(job.retry).not.toHaveBeenCalled();
      }
    });

    it('has its stream asked for again only when no job for it is kept', async () => {
      mockVideoQueue.getJob.mockResolvedValueOnce({ id: 'kept' });
      await expect(service.recoverTranscode('/uploads/v.mp4')).resolves.toBe(
        false,
      );
      expect(mockVideoQueue.add).not.toHaveBeenCalled();

      mockVideoQueue.getJob.mockResolvedValueOnce(undefined);
      await expect(service.recoverTranscode('/uploads/v.mp4')).resolves.toBe(
        true,
      );
      expect(mockVideoQueue.add).toHaveBeenCalledWith(
        'transcode',
        expect.objectContaining({ url: '/uploads/v.mp4' }),
        expect.objectContaining({ jobId: expect.stringContaining('v') }),
      );
    });

    it('makes the replay of a broadcast by one job per broadcast, asked again only when none is kept', async () => {
      await service.enqueueLiveReplay('s-1');
      expect(mockVideoQueue.add).toHaveBeenCalledWith(
        'live-replay',
        { streamId: 's-1' },
        expect.objectContaining({
          jobId: expect.stringContaining('s-1'),
          attempts: 3,
        }),
      );

      mockVideoQueue.add.mockClear();
      mockVideoQueue.getJob.mockResolvedValueOnce({ id: 'kept' });
      await expect(service.recoverLiveReplay('s-1')).resolves.toBe(false);
      expect(mockVideoQueue.add).not.toHaveBeenCalled();

      mockVideoQueue.getJob.mockResolvedValueOnce(undefined);
      await expect(service.recoverLiveReplay('s-1')).resolves.toBe(true);
      expect(mockVideoQueue.add).toHaveBeenCalledWith(
        'live-replay',
        { streamId: 's-1' },
        expect.anything(),
      );
    });

    it('is read only from the files of its storage, and from none without a way to tell', () => {
      expect(
        service.ownsUrl('/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.png'),
      ).toBe(true);
      expect(service.ownsUrl('https://evil.example/a.png')).toBe(false);

      Object.defineProperty(provider, 'ownsUrl', { value: undefined });
      expect(
        service.ownsUrl('/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.png'),
      ).toBe(false);
    });
  });

  describe('a Frame put together from its clips', () => {
    const CLIP_A = '/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.mp4';
    const CLIP_B = '/uploads/4a3c9d2f-0b5e-4d8c-9f32-6e7a8b9c0d1e.webm';
    const LAYER = '/uploads/5b4d0e3a-1c6f-4e9d-8a43-7f8b9c0d1e2f.avif';
    const BY = { profileId: 'profile-1', userId: 'user-1' };

    it('is queued once its clips are checked, with a fresh id the person asks after', async () => {
      const answer = await service.startFrameAssembly(BY, {
        clips: [
          { url: CLIP_A, startMs: 1000, endMs: 11_000 },
          { url: CLIP_B, startMs: 0, endMs: 8000 },
        ],
        layerUrl: LAYER,
        muted: true,
      });

      expect(answer.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      // Every clip and the layer must be the Profile's own.
      expect(mockStoredFiles.assertOwnedBy).toHaveBeenCalledWith('profile-1', [
        CLIP_A,
        CLIP_B,
        LAYER,
      ]);
      expect(mockVideoQueue.add).toHaveBeenCalledWith(
        'frame-assembly',
        {
          profileId: 'profile-1',
          userId: 'user-1',
          clips: [
            { url: CLIP_A, startMs: 1000, endMs: 11_000 },
            { url: CLIP_B, startMs: 0, endMs: 8000 },
          ],
          layerUrl: LAYER,
          muted: true,
        },
        {
          jobId: `frame-assembly-${answer.id}`,
          // Retried once, and kept by age only: never dropped by a busy queue
          // before its author asks after it.
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 24 * 3600 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      );

      const again = await service.startFrameAssembly(BY, {
        clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
      });
      expect(again.id).not.toBe(answer.id);
    });

    it('carries the look the author chose, without the values that change nothing', async () => {
      await service.startFrameAssembly(BY, {
        clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
        // A value left out (undefined) is as if not given.
        look: { grayscale: 100, brightness: 100, hue: 350, blur: undefined },
      });
      expect(mockVideoQueue.add).toHaveBeenLastCalledWith(
        'frame-assembly',
        expect.objectContaining({ look: { grayscale: 100, hue: 350 } }),
        expect.anything(),
      );

      // A look that changes nothing is no look.
      await service.startFrameAssembly(BY, {
        clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
        look: { brightness: 100, sepia: 0 },
      });
      expect(mockVideoQueue.add.mock.lastCall?.[1]).not.toHaveProperty('look');
    });

    it.each([
      ['a value past its range', { brightness: 201 }],
      ['a value under its range', { contrast: -1 }],
      ['a value that is not whole', { hue: 12.5 }],
      ['a value that is not a number', { blur: '2' }],
      ['a value the server does not know', { exposure: 50 }],
      ['a look that is not an object', 'grayscale'],
    ])('refuses a look with %s, and queues nothing', async (_, look) => {
      await expect(
        service.startFrameAssembly(BY, {
          clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
          look: look as never,
        }),
      ).rejects.toThrow('FRAME_LOOK_INVALID');
      expect(mockVideoQueue.add).not.toHaveBeenCalled();
    });

    it.each([
      ['no clip', [], 'FRAME_CLIPS_OUT_OF_RANGE'],
      [
        'more clips than a Frame may hold',
        Array.from({ length: 21 }, () => ({
          url: CLIP_A,
          startMs: 0,
          endMs: 1000,
        })),
        'FRAME_CLIPS_OUT_OF_RANGE',
      ],
      [
        'a part that ends before it starts',
        [{ url: CLIP_A, startMs: 5000, endMs: 5000 }],
        'FRAME_CLIP_RANGE_INVALID',
      ],
      [
        'a part that starts before the clip',
        [{ url: CLIP_A, startMs: -1, endMs: 20_000 }],
        'FRAME_CLIP_RANGE_INVALID',
      ],
      [
        'a moment that is not a whole ms',
        [{ url: CLIP_A, startMs: 0.5, endMs: 20_000 }],
        'FRAME_CLIP_RANGE_INVALID',
      ],
      [
        'a Frame shorter than a Frame may be',
        [{ url: CLIP_A, startMs: 0, endMs: 14_999 }],
        'FRAME_DURATION_OUT_OF_RANGE',
      ],
      [
        'a Frame longer than a Frame may be',
        [
          { url: CLIP_A, startMs: 0, endMs: 100_000 },
          { url: CLIP_B, startMs: 0, endMs: 80_001 },
        ],
        'FRAME_DURATION_OUT_OF_RANGE',
      ],
      [
        'a clip of another storage',
        [{ url: 'https://evil.example/a.mp4', startMs: 0, endMs: 20_000 }],
        'FRAME_MEDIA_NOT_OURS',
      ],
    ])(
      'is refused with %s, and nothing is queued',
      async (_case, clips, code) => {
        await expect(
          service.startFrameAssembly(BY, { clips }),
        ).rejects.toMatchObject({ status: 400, message: code });
        expect(mockVideoQueue.add).not.toHaveBeenCalled();
      },
    );

    it('takes the longest Frame and up to the most clips a Frame may hold', async () => {
      await service.startFrameAssembly(BY, {
        clips: Array.from({ length: 20 }, () => ({
          url: CLIP_A,
          startMs: 0,
          endMs: 9000,
        })),
      });
      expect(mockVideoQueue.add).toHaveBeenCalledTimes(1);
    });

    it('is refused when the layer is of another storage, or a file is not the Profile’s own', async () => {
      await expect(
        service.startFrameAssembly(BY, {
          clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
          layerUrl: 'https://evil.example/layer.png',
        }),
      ).rejects.toMatchObject({ message: 'FRAME_MEDIA_NOT_OURS' });

      mockStoredFiles.assertOwnedBy.mockRejectedValueOnce(
        new Error('FILE_NOT_OWNED'),
      );
      await expect(
        service.startFrameAssembly(BY, {
          clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
        }),
      ).rejects.toThrow('FILE_NOT_OWNED');
      expect(mockVideoQueue.add).not.toHaveBeenCalled();
    });

    it('waits its turn like any video: refused when the person already has their share queued', async () => {
      mockVideoQueue.getJobs.mockResolvedValueOnce([
        { data: { userId: 'user-1' } },
        { data: { userId: 'user-1' } },
      ]);

      await expect(
        service.startFrameAssembly(BY, {
          clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
        }),
      ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
      expect(mockVideoQueue.add).not.toHaveBeenCalled();
      // A job waiting to be tried again counts in the share too.
      expect(mockVideoQueue.getJobs).toHaveBeenCalledWith([
        'active',
        'waiting',
        'delayed',
      ]);
    });

    const jobOf = (state: string, overrides: Record<string, unknown> = {}) => ({
      name: 'frame-assembly',
      data: { profileId: 'profile-1' },
      returnvalue: { url: '/uploads/frame.mp4' },
      getState: vi.fn().mockResolvedValue(state),
      ...overrides,
    });

    it.each([
      ['waiting', { status: 'PENDING' }],
      ['active', { status: 'PENDING' }],
      // A failed try that is tried again waits as delayed.
      ['delayed', { status: 'PENDING' }],
      ['failed', { status: 'FAILED' }],
      ['completed', { status: 'READY', url: '/uploads/frame.mp4' }],
    ])('answers a %s job as %o', async (state, answer) => {
      mockVideoQueue.getJob.mockResolvedValueOnce(jobOf(state));

      await expect(
        service.frameAssemblyStatus('profile-1', 'job-id'),
      ).resolves.toEqual(answer);
      expect(mockVideoQueue.getJob).toHaveBeenCalledWith(
        'frame-assembly-job-id',
      );
    });

    it('answers a finished job with no video as failed', async () => {
      mockVideoQueue.getJob.mockResolvedValueOnce(
        jobOf('completed', { returnvalue: null }),
      );

      await expect(
        service.frameAssemblyStatus('profile-1', 'job-id'),
      ).resolves.toEqual({ status: 'FAILED' });
    });

    it.each([
      ['no job', undefined],
      [
        'another Profile’s job',
        jobOf('completed', { data: { profileId: 'p-2' } }),
      ],
      ['a job of another kind', jobOf('completed', { name: 'transcode' })],
      ['a job with no data', jobOf('completed', { data: undefined })],
    ])(
      'answers %s as not found, and tells nothing of it',
      async (_case, job) => {
        mockVideoQueue.getJob.mockResolvedValueOnce(job);

        await expect(
          service.frameAssemblyStatus('profile-1', 'job-id'),
        ).rejects.toMatchObject({
          status: 404,
          message: 'FRAME_ASSEMBLY_NOT_FOUND',
        });
      },
    );
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

  describe('a recorded voice note', () => {
    const recording: UploadedFile = {
      originalname: 'voice-note.webm',
      mimetype: 'audio/webm',
      buffer: Buffer.from('recorded-bytes'),
    };

    it('is stored converted, as an m4a file, and is not queued as a video', async () => {
      const upload = vi
        .spyOn(provider, 'upload')
        .mockResolvedValue({ url: '/uploads/voice.m4a', type: 'audio' });

      const result = await service.uploadFile(recording, 'user-1');

      expect(mockVoiceNoteConverter.toM4a).toHaveBeenCalledWith(
        recording.buffer,
      );
      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({
          buffer: Buffer.from('converted-voice'),
          mimetype: 'audio/x-m4a',
        }),
      );
      expect(result).toEqual({ url: '/uploads/voice.m4a', type: 'audio' });
      expect(mockVideoQueue.add).not.toHaveBeenCalled();
    });

    it('is not stored when it cannot be converted', async () => {
      const upload = vi.spyOn(provider, 'upload');
      mockVoiceNoteConverter.toM4a.mockRejectedValueOnce(
        new Error('not a recording'),
      );

      await expect(service.uploadFile(recording, 'user-1')).rejects.toThrow(
        'not a recording',
      );
      expect(upload).not.toHaveBeenCalled();
    });

    it('leaves any other sound file as it was sent', async () => {
      const upload = vi
        .spyOn(provider, 'upload')
        .mockResolvedValue({ url: '/uploads/song.mp3', type: 'audio' });
      const song: UploadedFile = {
        originalname: 'song.mp3',
        mimetype: 'audio/mpeg',
        buffer: Buffer.from('mp3-bytes'),
      };

      await service.uploadFile(song, 'user-1');

      expect(mockVoiceNoteConverter.toM4a).not.toHaveBeenCalled();
      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({
          buffer: song.buffer,
          mimetype: 'audio/mpeg',
        }),
      );
    });
  });

  describe('Video Admission Control and Quotas', () => {
    const videoFile: UploadedFile = {
      originalname: 'clip.mp4',
      mimetype: 'video/mp4',
      buffer: Buffer.from('fake-video-bytes'),
    };

    it('stores a clip of a Frame as it is: no place in the video queue, no stream of its own', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      // The person's share of the queue is full: a clip still goes in.
      mockVideoQueue.getJobs.mockResolvedValue([
        { data: { userId: 'user-abc' } },
        { data: { userId: 'user-abc' } },
      ]);

      const result = await service.uploadFile(videoFile, 'user-abc', 'p-1', {
        frameClip: true,
      });

      expect(result.url).toContain('/uploads/');
      expect(mockVideoQueue.getJobs).not.toHaveBeenCalled();
      expect(mockVideoQueue.add).not.toHaveBeenCalled();
    });

    it('refuses as a clip of a Frame a file that is not a video', async () => {
      await expect(
        service.uploadFile(
          {
            originalname: 'photo.png',
            mimetype: 'image/png',
            buffer: Buffer.from('fake-image-bytes'),
          },
          'user-abc',
          'p-1',
          { frameClip: true },
        ),
      ).rejects.toThrow('FRAME_CLIP_NOT_VIDEO');
    });

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
          // No colon: the queue refuses an id that has one.
          jobId: expect.stringMatching(/^transcode-[^:]+$/),
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

  describe("a deleted piece of content's files", () => {
    it('keeps the files of deleted content: marks the unused ones detached and deletes none', async () => {
      const deleteSpy = vi.spyOn(provider, 'delete').mockResolvedValue();

      const tx = { storedFile: {} };
      await service.releaseContentFiles(['/uploads/a.jpg', null], tx as never);

      // In the transaction that deletes the content, when one is given.
      expect(mockStoredFiles.release).toHaveBeenCalledWith(
        '',
        ['/uploads/a.jpg', null],
        tx,
      );
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(mockStoredFiles.forget).not.toHaveBeenCalled();
    });

    it("deletes only the files the record says are the author's and unused", async () => {
      const U = '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d';
      mockStoredFiles.release.mockResolvedValueOnce([`/uploads/${U}.jpg`]);
      const deleteSpy = vi.spyOn(provider, 'delete').mockResolvedValue();

      const deleted = await service.deleteContentFiles('author', [
        `/uploads/${U}.jpg`,
        '/uploads/theirs.jpg',
      ]);

      expect(mockStoredFiles.release).toHaveBeenCalledWith('author', [
        `/uploads/${U}.jpg`,
        '/uploads/theirs.jpg',
      ]);
      expect(deleted).toEqual([`/uploads/${U}.jpg`]);
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy).toHaveBeenCalledWith(`/uploads/${U}.jpg`);
      expect(mockStoredFiles.forget).toHaveBeenCalledWith([
        `/uploads/${U}.jpg`,
      ]);
    });

    it('deletes the files of content about to be erased, before its rows, and stops at the first failure', async () => {
      const ignoring = { story: ['s-1'] };
      mockStoredFiles.erasableWith.mockResolvedValueOnce([
        '/uploads/a.jpg',
        '/uploads/b.jpg',
      ]);
      const deleteSpy = vi.spyOn(provider, 'delete').mockResolvedValue();

      await expect(
        service.deleteFilesOfErasedContent(
          'author',
          ['/uploads/a.jpg', '/uploads/b.jpg', null],
          ignoring,
        ),
      ).resolves.toEqual(['/uploads/a.jpg', '/uploads/b.jpg']);
      expect(mockStoredFiles.erasableWith).toHaveBeenCalledWith(
        'author',
        ['/uploads/a.jpg', '/uploads/b.jpg', null],
        ignoring,
      );
      expect(deleteSpy).toHaveBeenCalledTimes(2);

      mockStoredFiles.erasableWith.mockResolvedValueOnce([
        '/uploads/a.jpg',
        '/uploads/b.jpg',
      ]);
      deleteSpy.mockReset();
      deleteSpy.mockRejectedValueOnce(new Error('disk'));
      await expect(
        service.deleteFilesOfErasedContent('author', ['/uploads/a.jpg'], {}),
      ).rejects.toThrow('disk');
      expect(deleteSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('who owns what is uploaded', () => {
    it('records each variant of an image as the Profile it was uploaded for', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      const imageFile: UploadedFile = {
        originalname: 'photo.png',
        mimetype: 'image/png',
        buffer: Buffer.from('fake-image-bytes'),
      };

      const result = await service.uploadFile(
        imageFile,
        'member-user',
        'business-profile',
      );

      expect(mockStoredFiles.record).toHaveBeenCalledWith(
        [result.url, result.standardUrl, result.thumbnailUrl],
        { profileId: 'business-profile', uploadedById: 'member-user' },
      );
    });

    it('records a video, and fails the upload when it cannot be recorded', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      const videoFile: UploadedFile = {
        originalname: 'clip.mp4',
        mimetype: 'video/mp4',
        buffer: Buffer.from('fake-video-bytes'),
      };

      const result = await service.uploadFile(videoFile, 'user-1', 'profile-1');
      expect(mockStoredFiles.record).toHaveBeenCalledWith([result.url], {
        profileId: 'profile-1',
        uploadedById: 'user-1',
      });

      // A file with no owner could never be attached nor deleted by its
      // Profile: the upload is refused instead of answered.
      mockStoredFiles.record.mockRejectedValueOnce(new Error('db down'));
      const deleteSpy = vi.spyOn(provider, 'delete').mockResolvedValue();
      await expect(
        service.uploadFile(videoFile, 'user-1', 'profile-1'),
      ).rejects.toThrow('db down');
      expect(mockVideoQueue.add).toHaveBeenCalledTimes(1);
      // The file that could not be recorded is not left on the disk.
      const discarded = mockStoredFiles.record.mock.calls.at(-1)?.[0][0];
      expect(deleteSpy).toHaveBeenCalledWith(discarded);
    });

    it('records no owner for a session that acts as no Profile', async () => {
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      const voice: UploadedFile = {
        originalname: 'song.mp3',
        mimetype: 'audio/mpeg',
        buffer: Buffer.from('fake-audio'),
      };

      await service.uploadFile(voice, 'user-1', '');

      expect(mockStoredFiles.record).toHaveBeenCalledWith(expect.any(Array), {
        profileId: null,
        uploadedById: 'user-1',
      });
    });
  });

  describe('LocalStorageProvider Deletion and Listing', () => {
    it('should delete file successfully when it exists', async () => {
      const unlinkSpy = vi
        .spyOn(fs.promises, 'unlink')
        .mockResolvedValue(undefined);

      await provider.delete(
        '/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.jpg',
      );
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

      await expect(
        provider.delete('/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.jpg'),
      ).rejects.toThrow('Disk I/O error');
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

    it('should delete file directly using storage provider', async () => {
      const deleteSpy = vi
        .spyOn(provider, 'delete')
        .mockResolvedValueOnce(undefined);

      await service.deleteFile('/uploads/direct.jpg');
      expect(deleteSpy).toHaveBeenCalledWith('/uploads/direct.jpg');
    });

    it('should return early if mediaUrls is null or empty in scheduleMediaDeletion', async () => {
      await service.scheduleMediaDeletion([]);
      await service.scheduleMediaDeletion(null as any);
      expect(mockMediaCleanupQueue.add).not.toHaveBeenCalled();
    });

    it('should fall back to direct deletion when queues are unavailable', async () => {
      const deleteSpy = vi
        .spyOn(service, 'deleteFile')
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Delete error'));

      (service as any).mediaCleanupQueue = undefined;
      (service as any).outboxService = undefined;

      await service.scheduleMediaDeletion([
        '/uploads/fallback-1.jpg',
        '/uploads/fallback-2.jpg',
      ]);

      expect(deleteSpy).toHaveBeenCalledTimes(2);
    });

    it('logs error and rethrows when upload flow fails', async () => {
      const errorFile: UploadedFile = {
        originalname: 'fail.png',
        mimetype: 'image/png',
        buffer: Buffer.from('bad'),
      };
      vi.spyOn(provider, 'upload').mockRejectedValueOnce(
        new Error('Storage unavailable'),
      );

      await expect(service.uploadFile(errorFile)).rejects.toThrow(
        'Storage unavailable',
      );
    });
  });
});
