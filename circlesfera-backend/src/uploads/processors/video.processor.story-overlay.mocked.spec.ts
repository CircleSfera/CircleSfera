import * as fs from 'node:fs';
import { type Job, UnrecoverableError } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageProvider } from '../interfaces/storage-provider.interface.js';
import type { StoredFilesService } from '../services/stored-files.service.js';
import type { UploadsService } from '../uploads.service.js';
import { VideoProcessor } from './video.processor.js';

/** How the video tool should end, and what it was asked for. */
const tool = vi.hoisted(() => ({
  mode: 'ok' as 'ok' | 'fail' | 'hang',
  filters: [] as string[],
  kill: vi.fn(),
}));

vi.mock('fluent-ffmpeg', () => {
  const command = () => {
    const handlers: Record<string, (error?: Error) => void> = {};
    let output = '';
    const self = {
      input: () => self,
      inputOptions: () => self,
      complexFilter: (filters: string[]) => {
        tool.filters = filters;
        return self;
      },
      outputOptions: () => self,
      output: (path: string) => {
        output = path;
        return self;
      },
      on: (event: string, handler: (error?: Error) => void) => {
        handlers[event] = handler;
        return self;
      },
      // A killed tool still says it ended in error, after the time is up.
      kill: (signal: string) => {
        try {
          tool.kill(signal);
        } finally {
          queueMicrotask(() => handlers.error?.(new Error('killed')));
        }
      },
      run: () => {
        if (tool.mode === 'hang') return;
        setTimeout(() => {
          if (tool.mode === 'fail') {
            handlers.error?.(new Error('ffmpeg exited with code 1'));
            return;
          }
          fs.writeFileSync(output, 'joined');
          handlers.end?.();
        }, 0);
      },
    };
    return self;
  };
  return { default: vi.fn(() => command()) };
});

vi.mock('sharp', () => ({
  default: () => {
    const self = {
      resize: () => self,
      png: () => self,
      toFile: async (path: string) => fs.writeFileSync(path, 'layer'),
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

const STORY = {
  id: 's-1',
  url: '/uploads/video.mp4',
  overlayUrl: '/uploads/layer.avif',
  mediaId: 'm-1',
  profileId: 'p-1',
};
const job = (storyId?: string) =>
  ({ name: 'story-overlay', data: { storyId } }) as unknown as Job<{
    url: string;
    storyId?: string;
  }>;

function setup({
  written = 1,
  storage = true,
}: {
  written?: number;
  storage?: boolean;
} = {}) {
  const prisma = {
    story: {
      findUnique: vi.fn().mockResolvedValue(STORY),
      updateMany: vi.fn().mockResolvedValue({ count: written }),
    },
    media: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    // The story and its Media row are written together.
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) =>
    fn(prisma),
  );
  const store = {
    upload: vi.fn().mockResolvedValue({ url: '/uploads/joined.mp4' }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const uploads = {
    ownsUrl: () => true,
    enqueueTranscode: vi.fn().mockResolvedValue(undefined),
    deleteContentFiles: vi.fn().mockResolvedValue([]),
  };
  const storedFiles = { record: vi.fn().mockResolvedValue(undefined) };
  const processor = new VideoProcessor(
    prisma as unknown as PrismaService,
    storage ? (store as unknown as StorageProvider) : undefined,
    uploads as unknown as UploadsService,
    storedFiles as unknown as StoredFilesService,
  );
  const { logger } = processor as unknown as { logger: { log: () => void } };
  vi.spyOn(logger, 'log').mockImplementation(() => {});
  return { prisma, store, uploads, storedFiles, processor };
}

describe('VideoProcessor: joining the layer of a story, step by step', () => {
  beforeEach(() => {
    tool.mode = 'ok';
    tool.filters = [];
    tool.kill.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('crops to 9:16, lays the layer over the video, stores the result and makes it the story’s', async () => {
    const { prisma, store, uploads, storedFiles, processor } = setup();

    await processor.process(job('s-1'));

    expect(tool.filters[0]).toContain('crop=720:1280');
    expect(tool.filters[1]).toContain('overlay=0:0:shortest=1');
    expect(store.upload).toHaveBeenCalledWith(
      expect.objectContaining({ mimetype: 'video/mp4' }),
    );
    expect(prisma.story.updateMany).toHaveBeenCalledWith({
      where: { id: 's-1', url: STORY.url, overlayUrl: STORY.overlayUrl },
      data: {
        url: '/uploads/joined.mp4',
        overlayUrl: null,
        standardUrl: null,
        thumbnailUrl: null,
      },
    });
    expect(prisma.media.updateMany).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: {
        url: '/uploads/joined.mp4',
        standardUrl: null,
        thumbnailUrl: null,
      },
    });
    expect(uploads.enqueueTranscode).toHaveBeenCalledWith(
      '/uploads/joined.mp4',
    );
    // The originals go only if they are the story's own and unused (TD-008).
    expect(uploads.deleteContentFiles).toHaveBeenCalledWith('p-1', [
      STORY.overlayUrl,
      STORY.url,
    ]);
    expect(store.delete).not.toHaveBeenCalledWith(STORY.url);
    // The joined video belongs to the story's Profile, written with the story.
    expect(storedFiles.record).toHaveBeenCalledWith(
      ['/uploads/joined.mp4'],
      { profileId: 'p-1' },
      prisma,
    );
  });

  it('keeps nothing when the story changed meanwhile, and writes no media of a story without one', async () => {
    const { prisma, store, uploads, storedFiles, processor } = setup({
      written: 0,
    });
    prisma.story.findUnique.mockResolvedValue({ ...STORY, mediaId: null });

    await processor.process(job('s-1'));

    expect(store.delete).toHaveBeenCalledWith('/uploads/joined.mp4');
    expect(storedFiles.record).not.toHaveBeenCalled();
    expect(prisma.media.updateMany).not.toHaveBeenCalled();
    expect(uploads.enqueueTranscode).not.toHaveBeenCalled();

    const again = setup();
    again.prisma.story.findUnique.mockResolvedValue({
      ...STORY,
      mediaId: null,
    });
    await again.processor.process(job('s-1'));
    expect(again.prisma.media.updateMany).not.toHaveBeenCalled();
    expect(again.uploads.enqueueTranscode).toHaveBeenCalled();
  });

  it('fails, to be tried again, when the video tool fails, and leaves the story as it was', async () => {
    tool.mode = 'fail';
    const { prisma, processor } = setup();

    await expect(processor.process(job('s-1'))).rejects.toThrow(
      'ffmpeg exited with code 1',
    );
    expect(prisma.story.updateMany).not.toHaveBeenCalled();
  });

  it('stops the video tool after five minutes', async () => {
    tool.mode = 'hang';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { processor } = setup();

    const joining = processor.process(job('s-1'));
    const outcome = expect(joining).rejects.toThrow('timed out');
    await vi.waitFor(() => expect(tool.filters).toHaveLength(2));
    tool.kill.mockImplementationOnce(() => {
      throw new Error('already gone');
    });
    await vi.advanceTimersByTimeAsync(300_000);

    await outcome;
    expect(tool.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('writes the story and its media together, and leaves the stream to the recovery when it cannot be queued', async () => {
    const { prisma, uploads, processor } = setup();
    uploads.enqueueTranscode.mockRejectedValueOnce(new Error('redis down'));

    await expect(processor.process(job('s-1'))).rejects.toThrow('redis down');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.media.updateMany).toHaveBeenCalled();
  });

  it('keeps no joined video when the story and its media cannot be written', async () => {
    const { prisma, store, uploads, processor } = setup();
    prisma.media.updateMany.mockRejectedValueOnce(new Error('db down'));

    await expect(processor.process(job('s-1'))).rejects.toThrow('db down');

    expect(store.delete).toHaveBeenCalledWith('/uploads/joined.mp4');
    expect(store.delete).not.toHaveBeenCalledWith(STORY.url);
    expect(uploads.enqueueTranscode).not.toHaveBeenCalled();
  });

  it('cannot join without a storage to keep the result', async () => {
    const { processor } = setup({ storage: false });

    await expect(processor.process(job('s-1'))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });
});
