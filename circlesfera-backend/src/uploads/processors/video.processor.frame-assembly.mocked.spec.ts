import * as fs from 'node:fs';
import * as path from 'node:path';
import { type Job, UnrecoverableError } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageProvider } from '../interfaces/storage-provider.interface.js';
import type { StoredFilesService } from '../services/stored-files.service.js';
import type {
  FrameAssemblyJobData,
  UploadsService,
} from '../uploads.service.js';
import { VideoProcessor } from './video.processor.js';

/** How the video tools should end, what they were asked and what they read. */
const tool = vi.hoisted(() => ({
  mode: 'ok' as 'ok' | 'fail' | 'hang',
  args: [] as string[],
  signal: undefined as AbortSignal | undefined,
  workDir: '',
  // What ffprobe reads of each clip, by its path.
  probes: {} as Record<
    string,
    { format?: { duration?: string }; streams?: { codec_type: string }[] }
  >,
}));

vi.mock('../../common/media/ffmpeg-runner.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../common/media/ffmpeg-runner.js')
    >();
  return {
    ...actual,
    ffprobe: vi.fn(async (input: string) => tool.probes[input] ?? {}),
    runFfmpeg: vi.fn(
      (args: string[], options: { signal?: AbortSignal } = {}) =>
        new Promise<void>((resolve, reject) => {
          tool.args = args;
          tool.workDir = path.dirname(args[args.length - 1]);
          tool.signal = options.signal;
          // Killed when the time is up, as the real runner does.
          options.signal?.addEventListener('abort', () =>
            reject(options.signal?.reason),
          );
          if (tool.mode === 'hang') return;
          setTimeout(() => {
            if (tool.mode === 'fail') {
              reject(new Error('ffmpeg exited with code 1'));
              return;
            }
            fs.writeFileSync(args[args.length - 1], 'frame');
            resolve();
          }, 0);
        }),
    ),
  };
});

const sharpCalls = vi.hoisted(() => ({ resize: [] as unknown[][] }));
vi.mock('sharp', () => ({
  default: () => {
    const self = {
      resize: (...args: unknown[]) => {
        sharpCalls.resize.push(args);
        return self;
      },
      png: () => self,
      toFile: async (file: string) => fs.writeFileSync(file, 'layer'),
    };
    return self;
  },
}));

vi.mock('../../common/utils/safe-media-fetcher.js', () => ({
  safeFetchMedia: vi.fn(async () => ({
    buffer: Buffer.from('layer'),
    contentType: 'image/avif',
    ext: 'avif',
  })),
}));

const CLIP_A = '/uploads/clip-a.mp4';
const CLIP_B = '/uploads/clip-b.webm';
const LAYER = '/uploads/layer.avif';
const at = (url: string) => path.join(process.cwd(), url);
const WITH_SOUND = { codec_type: 'audio' };
const PICTURE = { codec_type: 'video' };

const job = (data: Partial<FrameAssemblyJobData> | undefined) =>
  ({ name: 'frame-assembly', data }) as unknown as Job<{ url: string }>;

function setup({
  storage = true,
  owns = true,
}: {
  storage?: boolean;
  owns?: boolean;
} = {}) {
  const store = {
    upload: vi.fn().mockResolvedValue({ url: '/uploads/frame.mp4' }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const uploads = {
    ownsUrl: vi.fn(() => owns),
    enqueueTranscode: vi.fn().mockResolvedValue(undefined),
    deleteContentFiles: vi.fn().mockResolvedValue([]),
  };
  const storedFiles = { record: vi.fn().mockResolvedValue(undefined) };
  const processor = new VideoProcessor(
    {} as unknown as PrismaService,
    storage ? (store as unknown as StorageProvider) : undefined,
    uploads as unknown as UploadsService,
    storedFiles as unknown as StoredFilesService,
  );
  const { logger } = processor as unknown as { logger: { log: () => void } };
  vi.spyOn(logger, 'log').mockImplementation(() => {});
  return { store, uploads, storedFiles, processor };
}

/** The encoding of every Frame, after its maps. */
const ENCODING = [
  '-c:v',
  'h264',
  '-preset',
  'veryfast',
  '-crf',
  '23',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
];
const SCALE =
  'fps=30,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1';
const SOUND_FORMAT = 'aformat=sample_rates=48000:channel_layouts=stereo';

describe('VideoProcessor: putting a Frame together from its clips', () => {
  beforeEach(() => {
    tool.mode = 'ok';
    tool.args = [];
    tool.signal = undefined;
    tool.workDir = '';
    tool.probes = {
      [at(CLIP_A)]: {
        format: { duration: '30.0' },
        streams: [PICTURE, WITH_SOUND],
      },
      [at(CLIP_B)]: {
        format: { duration: '12.5' },
        streams: [PICTURE, WITH_SOUND],
      },
    };
    sharpCalls.resize = [];
  });
  afterEach(() => vi.useRealTimers());

  it('trims and crops one clip, keeps its sound, stores the video as the Profile’s and asks for its stream', async () => {
    const { store, uploads, storedFiles, processor } = setup();

    const result = await processor.process(
      job({
        profileId: 'p-1',
        clips: [{ url: CLIP_A, startMs: 1500, endMs: 21_500 }],
      }),
    );

    expect(tool.args).toEqual([
      '-i',
      at(CLIP_A),
      '-y',
      '-filter_complex',
      [
        `[0:v]trim=start=1.5:end=21.5,setpts=PTS-STARTPTS,${SCALE}[v0]`,
        `[0:a]atrim=start=1.5:end=21.5,asetpts=PTS-STARTPTS,${SOUND_FORMAT}[a0]`,
        '[v0][a0]concat=n=1:v=1:a=1[out][sound]',
      ].join(';'),
      '-map',
      '[out]',
      '-map',
      '[sound]',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      ...ENCODING,
      path.join(tool.workDir, 'frame.mp4'),
    ]);
    expect(path.basename(tool.workDir)).toMatch(/^frame-assembly-/);
    expect(store.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        originalname: expect.stringMatching(/\.mp4$/),
        mimetype: 'video/mp4',
        buffer: Buffer.from('frame'),
      }),
    );
    expect(storedFiles.record).toHaveBeenCalledWith(['/uploads/frame.mp4'], {
      profileId: 'p-1',
    });
    expect(uploads.enqueueTranscode).toHaveBeenCalledWith('/uploads/frame.mp4');
    expect(result).toEqual({ url: '/uploads/frame.mp4' });
    // The clips stay: the author may go back to the editor.
    expect(store.delete).not.toHaveBeenCalled();
    expect(uploads.deleteContentFiles).not.toHaveBeenCalled();
    // The work folder is gone.
    expect(fs.existsSync(tool.workDir)).toBe(false);
  });

  it('joins several clips in their order with the layer over the whole length', async () => {
    const { processor } = setup();

    await processor.process(
      job({
        profileId: 'p-1',
        clips: [
          { url: CLIP_B, startMs: 0, endMs: 12_000 },
          { url: CLIP_A, startMs: 2000, endMs: 10_000 },
        ],
        layerUrl: LAYER,
      }),
    );

    expect(tool.args).toEqual([
      '-i',
      at(CLIP_B),
      '-i',
      at(CLIP_A),
      '-loop',
      '1',
      '-i',
      path.join(tool.workDir, 'layer.png'),
      '-y',
      '-filter_complex',
      [
        `[0:v]trim=start=0:end=12,setpts=PTS-STARTPTS,${SCALE}[v0]`,
        `[0:a]atrim=start=0:end=12,asetpts=PTS-STARTPTS,${SOUND_FORMAT}[a0]`,
        `[1:v]trim=start=2:end=10,setpts=PTS-STARTPTS,${SCALE}[v1]`,
        `[1:a]atrim=start=2:end=10,asetpts=PTS-STARTPTS,${SOUND_FORMAT}[a1]`,
        '[v0][a0][v1][a1]concat=n=2:v=1:a=1[joined][sound]',
        '[joined][2:v]overlay=0:0:shortest=1:format=auto[out]',
      ].join(';'),
      '-map',
      '[out]',
      '-map',
      '[sound]',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      ...ENCODING,
      path.join(tool.workDir, 'frame.mp4'),
    ]);
    // The layer is read at the size of the video.
    expect(sharpCalls.resize).toEqual([[720, 1280, { fit: 'fill' }]]);
  });

  it('makes a Frame with no sound track when a clip has none', async () => {
    tool.probes[at(CLIP_B)] = {
      format: { duration: '12.5' },
      streams: [PICTURE],
    };
    const { processor } = setup();

    await processor.process(
      job({
        profileId: 'p-1',
        clips: [
          { url: CLIP_A, startMs: 0, endMs: 10_000 },
          { url: CLIP_B, startMs: 0, endMs: 10_000 },
        ],
        layerUrl: LAYER,
      }),
    );

    const filters = tool.args[tool.args.indexOf('-filter_complex') + 1];
    expect(filters.split(';')).toEqual([
      `[0:v]trim=start=0:end=10,setpts=PTS-STARTPTS,${SCALE}[v0]`,
      `[1:v]trim=start=0:end=10,setpts=PTS-STARTPTS,${SCALE}[v1]`,
      '[v0][v1]concat=n=2:v=1:a=0[joined]',
      '[joined][2:v]overlay=0:0:shortest=1:format=auto[out]',
    ]);
    expect(tool.args).toContain('-an');
    expect(tool.args).not.toContain('[sound]');
    expect(tool.args).not.toContain('-c:a');
  });

  it('makes a Frame with no sound track when the author muted it', async () => {
    const { processor } = setup();

    await processor.process(
      job({
        profileId: 'p-1',
        clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
        muted: true,
      }),
    );

    expect(tool.args).toEqual([
      '-i',
      at(CLIP_A),
      '-y',
      '-filter_complex',
      [
        `[0:v]trim=start=0:end=20,setpts=PTS-STARTPTS,${SCALE}[v0]`,
        '[v0]concat=n=1:v=1:a=0[out]',
      ].join(';'),
      '-map',
      '[out]',
      '-an',
      ...ENCODING,
      path.join(tool.workDir, 'frame.mp4'),
    ]);
  });

  it('reads a clip it cannot read the streams of as one with no sound', async () => {
    tool.probes[at(CLIP_A)] = { format: { duration: '30.0' } };
    const { processor } = setup();

    await processor.process(
      job({
        profileId: 'p-1',
        clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
      }),
    );

    expect(tool.args).toContain('-an');
  });

  it('refuses, for good, a Frame whose parts run past the ends of its clips and leave it too short', async () => {
    const { store, processor } = setup();

    // Clip B lasts 12.5 s: asked for 20 s of it, 12.5 s are there.
    const making = processor.process(
      job({
        profileId: 'p-1',
        clips: [{ url: CLIP_B, startMs: 0, endMs: 20_000 }],
      }),
    );

    await expect(making).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(making).rejects.toThrow('FRAME_DURATION_OUT_OF_RANGE');
    expect(tool.args).toEqual([]);
    expect(store.upload).not.toHaveBeenCalled();
  });

  it('takes a clip whose length cannot be read at its word', async () => {
    tool.probes[at(CLIP_B)] = {
      format: { duration: 'N/A' },
      streams: [PICTURE],
    };
    const { processor } = setup();

    await expect(
      processor.process(
        job({
          profileId: 'p-1',
          clips: [{ url: CLIP_B, startMs: 0, endMs: 20_000 }],
        }),
      ),
    ).resolves.toEqual({ url: '/uploads/frame.mp4' });
  });

  it('fails, to be tried again, when the video tool fails, keeps nothing and removes its work folder', async () => {
    tool.mode = 'fail';
    const { store, storedFiles, uploads, processor } = setup();

    await expect(
      processor.process(
        job({
          profileId: 'p-1',
          clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
        }),
      ),
    ).rejects.toThrow('ffmpeg exited with code 1');

    expect(tool.workDir).not.toBe('');
    expect(fs.existsSync(tool.workDir)).toBe(false);
    expect(store.upload).not.toHaveBeenCalled();
    expect(storedFiles.record).not.toHaveBeenCalled();
    expect(uploads.enqueueTranscode).not.toHaveBeenCalled();
  });

  it('keeps no video with no owner when it cannot be recorded as the Profile’s', async () => {
    const { store, storedFiles, uploads, processor } = setup();
    storedFiles.record.mockRejectedValueOnce(new Error('db down'));

    await expect(
      processor.process(
        job({
          profileId: 'p-1',
          clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
        }),
      ),
    ).rejects.toThrow('db down');

    expect(store.delete).toHaveBeenCalledWith('/uploads/frame.mp4');
    expect(uploads.enqueueTranscode).not.toHaveBeenCalled();
    expect(fs.existsSync(tool.workDir)).toBe(false);
  });

  it('stops the video tool when its time is up', async () => {
    tool.mode = 'hang';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { processor } = setup();

    const making = processor.process(
      job({
        profileId: 'p-1',
        clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
      }),
    );
    const outcome = expect(making).rejects.toThrow('timed out');
    await vi.waitFor(() => expect(tool.args).not.toEqual([]));
    await vi.advanceTimersByTimeAsync(600_000);

    await outcome;
    expect(tool.signal?.aborted).toBe(true);
  });

  it('refuses, for good, a job with no clips, no storage, or a file of another storage', async () => {
    await expect(
      setup().processor.process(job(undefined)),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(
      setup().processor.process(job({ profileId: 'p-1', clips: [] })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(
      setup({ storage: false }).processor.process(
        job({
          profileId: 'p-1',
          clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
        }),
      ),
    ).rejects.toThrow('No storage to keep a Frame');

    const foreign = setup({ owns: false });
    await expect(
      foreign.processor.process(
        job({
          profileId: 'p-1',
          clips: [{ url: CLIP_A, startMs: 0, endMs: 20_000 }],
          layerUrl: 'https://evil.example/layer.png',
        }),
      ),
    ).rejects.toThrow('not of this storage');
    expect(tool.args).toEqual([]);
  });
});
