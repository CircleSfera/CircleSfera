import * as fs from 'node:fs';
import type { Job } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeMediaDurationSec } from '../../common/utils/media-duration.util.js';
import { VideoProcessor } from './video.processor.js';

/** What the image tool was last asked for, and how it should end. */
const tool = vi.hoisted(() => ({
  args: undefined as string[] | undefined,
  signal: undefined as AbortSignal | undefined,
  fails: false,
  hangs: false,
  /** The tool says it ended, whenever that happens. */
  end: () => {},
}));

vi.mock('../../common/media/ffmpeg-runner.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../common/media/ffmpeg-runner.js')
    >();
  return {
    ...actual,
    runFfmpeg: vi.fn(
      (args: string[], options: { signal?: AbortSignal } = {}) =>
        new Promise<void>((resolve, reject) => {
          tool.args = args;
          tool.signal = options.signal;
          tool.end = () => resolve();
          // Killed when the time is up, as the real runner does.
          options.signal?.addEventListener('abort', () =>
            reject(options.signal?.reason),
          );
          if (tool.hangs) return;
          if (tool.fails) reject(new Error('no such frame'));
          else resolve();
        }),
    ),
  };
});

/** The moment the image was asked at. */
const shotAt = () => Number(tool.args?.[1]);

vi.mock('../../common/utils/media-duration.util.js', () => ({
  probeMediaDurationSec: vi.fn(),
  resolveMediaInputPath: (url: string) => `resolved:${url}`,
}));

describe('VideoProcessor: the cover of a frame', () => {
  const prisma = {
    postMedia: { findUnique: vi.fn(), updateMany: vi.fn() },
    media: { updateMany: vi.fn() },
  };
  const storage = { upload: vi.fn(), delete: vi.fn() };
  const media = {
    id: 'pm-1',
    url: 'https://cdn.example.com/video.mp4',
    coverTimeMs: 4200,
    mediaId: 'm-1',
    post: { profileId: 'p-1' },
  };
  const storedFiles = { record: vi.fn().mockResolvedValue(undefined) };
  const job = (postMediaId?: string) =>
    ({ name: 'cover', data: { postMediaId } }) as unknown as Job<{
      url: string;
      postMediaId?: string;
    }>;
  let processor: VideoProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    tool.args = undefined;
    tool.signal = undefined;
    tool.fails = false;
    tool.hangs = false;
    vi.mocked(probeMediaDurationSec).mockResolvedValue(30);
    prisma.postMedia.findUnique.mockResolvedValue(media);
    prisma.postMedia.updateMany.mockResolvedValue({ count: 1 });
    prisma.media.updateMany.mockResolvedValue({ count: 1 });
    storage.upload.mockResolvedValue({
      url: 'https://cdn.example.com/cover.jpg',
      type: 'image',
    });
    storage.delete.mockResolvedValue(undefined);
    vi.spyOn(fs.promises, 'mkdtemp').mockResolvedValue('/tmp/frame-cover-x');
    vi.spyOn(fs.promises, 'readFile').mockResolvedValue(
      Buffer.from('jpeg') as never,
    );
    vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);
    storedFiles.record.mockClear();
    processor = new VideoProcessor(
      prisma as never,
      storage as never,
      undefined,
      storedFiles as never,
    );
    vi.spyOn(
      (processor as unknown as { logger: { log: () => void } }).logger,
      'log',
    ).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('takes the image at the chosen moment of the frame’s own video and makes it the cover', async () => {
    await processor.process(job('pm-1'));

    // The same arguments the processor started ffmpeg with before: one
    // frame at the moment, 540 px wide, written as cover.jpg.
    expect(tool.args).toEqual([
      '-ss',
      '4.2',
      '-i',
      'resolved:https://cdn.example.com/video.mp4',
      '-y',
      '-filter_complex',
      'scale=w=540:h=trunc(ow/a/2)*2[size0];[size0]split=1[screen0]',
      '-vframes',
      '1',
      '-map',
      '[screen0]',
      '/tmp/frame-cover-x/cover.jpg',
    ]);
    expect(storage.upload).toHaveBeenCalledWith({
      originalname: expect.stringMatching(/\.jpg$/),
      buffer: Buffer.from('jpeg'),
      mimetype: 'image/jpeg',
    });
    expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({
      where: { id: 'pm-1', coverTimeMs: 4200 },
      data: { thumbnailUrl: 'https://cdn.example.com/cover.jpg' },
    });
    // The address the API answers with comes from this row first.
    expect(prisma.media.updateMany).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: { thumbnailUrl: 'https://cdn.example.com/cover.jpg' },
    });
    // The cover belongs to the Profile of the post, recorded before use.
    expect(storedFiles.record).toHaveBeenCalledWith(
      ['https://cdn.example.com/cover.jpg'],
      { profileId: 'p-1' },
    );
    expect(storedFiles.record.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.postMedia.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('takes the last moment when the one asked for is past the end', async () => {
    vi.mocked(probeMediaDurationSec).mockResolvedValue(3);

    await processor.process(job('pm-1'));

    expect(shotAt()).toBeCloseTo(2.9);
  });

  it('never asks for a moment before the start', async () => {
    vi.mocked(probeMediaDurationSec).mockResolvedValue(0.05);
    prisma.postMedia.findUnique.mockResolvedValue({ ...media, coverTimeMs: 0 });

    await processor.process(job('pm-1'));

    expect(shotAt()).toBe(0);
  });

  it('deletes its image again when it cannot be recorded, and fails to be retried', async () => {
    storedFiles.record.mockRejectedValueOnce(new Error('db down'));

    await expect(processor.process(job('pm-1'))).rejects.toThrow('db down');

    expect(storage.delete).toHaveBeenCalledWith(
      'https://cdn.example.com/cover.jpg',
    );
    expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
  });

  it('drops its image when the author chose another moment meanwhile', async () => {
    prisma.postMedia.updateMany.mockResolvedValue({ count: 0 });

    await processor.process(job('pm-1'));

    expect(storage.delete).toHaveBeenCalledWith(
      'https://cdn.example.com/cover.jpg',
    );
    expect(prisma.media.updateMany).not.toHaveBeenCalled();
    // It was recorded before being used; the record outlives the file.
    expect(storedFiles.record).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the frame was deleted', null],
    ['the cover is no longer a chosen one', { ...media, coverTimeMs: null }],
  ])('does nothing when %s', async (_why, found) => {
    prisma.postMedia.findUnique.mockResolvedValue(found);

    await processor.process(job('pm-1'));

    expect(tool.args).toBeUndefined();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
  });

  it('keeps the previous cover and cleans up when the image cannot be taken', async () => {
    tool.fails = true;

    await expect(processor.process(job('pm-1'))).rejects.toThrow(
      'no such frame',
    );
    expect(storage.upload).not.toHaveBeenCalled();
    expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
    expect(fs.promises.rm).toHaveBeenCalledWith('/tmp/frame-cover-x', {
      recursive: true,
      force: true,
    });
  });

  it('gives up after two minutes on a tool that does not end', async () => {
    vi.useFakeTimers();
    tool.hangs = true;

    const run = processor.process(job('pm-1'));
    const refused = expect(run).rejects.toThrow(
      'Making the cover of a frame timed out',
    );
    await vi.advanceTimersByTimeAsync(120_001);
    await refused;

    // The run was told to stop: the runner kills the program then.
    expect(tool.signal?.aborted).toBe(true);
    // An answer of the tool after that changes nothing.
    tool.end();
    expect(storage.upload).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not fail when the image it drops or its work folder cannot be removed', async () => {
    prisma.postMedia.updateMany.mockResolvedValue({ count: 0 });
    storage.delete.mockRejectedValue(new Error('storage down'));
    vi.mocked(fs.promises.rm).mockRejectedValue(new Error('busy'));

    await expect(processor.process(job('pm-1'))).resolves.toBeUndefined();
  });

  it('writes nothing to a frame whose media has no shared record', async () => {
    prisma.postMedia.findUnique.mockResolvedValue({ ...media, mediaId: null });

    await processor.process(job('pm-1'));

    expect(prisma.postMedia.updateMany).toHaveBeenCalled();
    expect(prisma.media.updateMany).not.toHaveBeenCalled();
  });

  it('gives up for good on a job with no media or with no storage', async () => {
    await expect(processor.process(job())).rejects.toThrow(
      'Missing media for the cover of a frame',
    );

    const withoutStorage = new VideoProcessor(prisma as never);
    await expect(withoutStorage.process(job('pm-1'))).rejects.toThrow(
      'No storage to keep the cover of a frame',
    );
  });
});
