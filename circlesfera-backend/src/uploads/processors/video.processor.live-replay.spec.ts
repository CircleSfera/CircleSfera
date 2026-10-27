import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { LiveReplayMaker } from './live-replay.maker.js';
import { VideoProcessor } from './video.processor.js';

describe('VideoProcessor: the replay of a broadcast', () => {
  const replays = {
    make: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
  };
  const job = (attemptsMade = 0, attempts = 3) =>
    ({
      name: 'live-replay',
      data: { streamId: 's1' },
      attemptsMade,
      opts: { attempts },
    }) as unknown as Job<{ url: string; streamId?: string }>;
  const processor = new VideoProcessor(
    {} as PrismaService,
    undefined,
    undefined,
    undefined,
    replays as unknown as LiveReplayMaker,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('makes the replay of the broadcast named', async () => {
    await processor.process(job());
    expect(replays.make).toHaveBeenCalledWith('s1');
    expect(replays.markFailed).not.toHaveBeenCalled();
  });

  it('leaves the recording waiting while tries remain', async () => {
    replays.make.mockRejectedValueOnce(new Error('busy'));
    await expect(processor.process(job(0))).rejects.toThrow('busy');
    expect(replays.markFailed).not.toHaveBeenCalled();
  });

  it('marks the recording failed after the last try', async () => {
    replays.make.mockRejectedValueOnce(new Error('busy'));
    await expect(processor.process(job(2))).rejects.toThrow('busy');
    expect(replays.markFailed).toHaveBeenCalledWith('s1');
  });

  it('marks it failed at once when no try can help, even if marking fails', async () => {
    replays.make.mockRejectedValueOnce(new UnrecoverableError('not its file'));
    replays.markFailed.mockRejectedValueOnce(new Error('db down'));
    await expect(processor.process(job(0))).rejects.toThrow('not its file');
    expect(replays.markFailed).toHaveBeenCalledWith('s1');
  });

  it('counts a job with no tries told as its last', async () => {
    replays.make.mockRejectedValueOnce(new Error('busy'));
    const bare = {
      name: 'live-replay',
      data: { streamId: 's1' },
      opts: {},
    } as unknown as Job<{ url: string }>;
    await expect(processor.process(bare)).rejects.toThrow('busy');
    expect(replays.markFailed).toHaveBeenCalledWith('s1');
  });

  it('refuses the job on a server with no maker of replays', async () => {
    const bare = new VideoProcessor({} as PrismaService);
    await expect(bare.process(job())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });
});
