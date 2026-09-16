import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { PostMediaCleanupService } from './post-media-cleanup.service.js';

describe('PostMediaCleanupService', () => {
  let service: PostMediaCleanupService;
  let mockPrisma: {
    post: { findMany: ReturnType<typeof vi.fn> };
  };
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };
  let mockPostsQueue: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPrisma = {
      post: { findMany: vi.fn() },
    };
    mockEventEmitter = { emit: vi.fn() };
    mockPostsQueue = { add: vi.fn().mockResolvedValue({}) };

    service = new PostMediaCleanupService(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
      mockPostsQueue as unknown as Queue,
    );
  });

  it('does nothing when cleanupMedia is called with empty or null media', async () => {
    await service.cleanupMedia(null);
    await service.cleanupMedia([]);
    expect(mockPostsQueue.add).not.toHaveBeenCalled();
  });

  it('enqueues unique media URLs for deletion in cleanupMedia', async () => {
    await service.cleanupMedia([
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
      mediaUrls: expect.arrayContaining([
        'https://cdn/original.jpg',
        'https://cdn/std.jpg',
        'https://cdn/thumb.jpg',
        'https://cdn/thumb2.jpg',
      ]),
    });
  });

  it('emits media.delete_batch on user hard deletion with found post media', async () => {
    mockPrisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        media: [
          {
            url: 'https://cdn/img1.jpg',
            standardUrl: null,
            thumbnailUrl: 'https://cdn/thumb1.jpg',
          },
        ],
      },
      {
        id: 'post-2',
        media: [
          {
            url: 'https://cdn/img2.jpg',
            standardUrl: 'https://cdn/std2.jpg',
            thumbnailUrl: null,
          },
        ],
      },
    ]);

    await service.handleUserDeleted({ profileId: 'deleted-user' });

    expect(mockPrisma.post.findMany).toHaveBeenCalledWith({
      where: { profileId: 'deleted-user' },
      include: { media: true },
    });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('media.delete_batch', {
      mediaUrls: expect.arrayContaining([
        'https://cdn/img1.jpg',
        'https://cdn/thumb1.jpg',
        'https://cdn/img2.jpg',
        'https://cdn/std2.jpg',
      ]),
    });
  });

  it('does not emit media.delete_batch if user has no media', async () => {
    mockPrisma.post.findMany.mockResolvedValue([{ id: 'post-1', media: [] }]);

    await service.handleUserDeleted({ profileId: 'user-without-media' });

    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });
});
