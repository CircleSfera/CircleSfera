import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostMediaCleanupService } from './post-media-cleanup.service.js';

describe('PostMediaCleanupService', () => {
  let service: PostMediaCleanupService;
  let mockPostsQueue: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPostsQueue = { add: vi.fn().mockResolvedValue({}) };

    service = new PostMediaCleanupService(mockPostsQueue as unknown as Queue);
  });

  it('does nothing when cleanupMedia is called with empty or null media', async () => {
    await service.cleanupMedia('author-1', null);
    await service.cleanupMedia('author-1', []);
    expect(mockPostsQueue.add).not.toHaveBeenCalled();
  });

  it('enqueues unique media URLs for deletion, with the author whose files they may be', async () => {
    await service.cleanupMedia('author-1', [
      {
        url: 'https://cdn/original.jpg',
        standardUrl: 'https://cdn/std.jpg',
        thumbnailUrl: 'https://cdn/thumb.jpg',
      },
      {
        url: 'https://cdn/original.jpg', // duplicate url
        standardUrl: null,
        thumbnailUrl: 'https://cdn/thumb2.jpg',
      },
    ]);

    expect(mockPostsQueue.add).toHaveBeenCalledWith('delete-post-media', {
      authorProfileId: 'author-1',
      mediaUrls: expect.arrayContaining([
        'https://cdn/original.jpg',
        'https://cdn/std.jpg',
        'https://cdn/thumb.jpg',
        'https://cdn/thumb2.jpg',
      ]),
    });
  });
});
