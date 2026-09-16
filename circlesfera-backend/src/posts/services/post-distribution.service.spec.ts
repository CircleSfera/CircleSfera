import type { EventEmitter2 } from '@nestjs/event-emitter';
import { Visibility } from '@prisma/client';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { PostDistributionService } from './post-distribution.service.js';

describe('PostDistributionService', () => {
  let service: PostDistributionService;
  let mockPrisma: {
    profile: { findMany: ReturnType<typeof vi.fn> };
  };
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };
  let mockAiQueue: { add: ReturnType<typeof vi.fn> };
  let mockFeedFanoutQueue: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPrisma = {
      profile: { findMany: vi.fn() },
    };
    mockEventEmitter = { emit: vi.fn() };
    mockAiQueue = { add: vi.fn().mockResolvedValue({}) };
    mockFeedFanoutQueue = { add: vi.fn().mockResolvedValue({}) };

    service = new PostDistributionService(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
      mockAiQueue as unknown as Queue,
      mockFeedFanoutQueue as unknown as Queue,
    );
  });

  it('enqueues AI jobs and fan-out for public posts', async () => {
    const post = {
      id: 'post-1',
      profileId: 'author-1',
      visibility: Visibility.PUBLIC,
      media: [
        { url: 'https://cdn/image.jpg', thumbnailUrl: 'https://cdn/thumb.jpg' },
      ],
    };

    await service.dispatchPostPublished(post, {
      caption: 'Look at this photo',
    });

    expect(mockAiQueue.add).toHaveBeenCalledWith('generate-embedding', {
      postId: 'post-1',
      text: 'Look at this photo',
    });
    expect(mockAiQueue.add).toHaveBeenCalledWith('moderate-content', {
      targetId: 'post-1',
      text: 'Look at this photo',
      targetType: 'POST',
      mediaUrls: ['https://cdn/thumb.jpg'],
    });
    expect(mockAiQueue.add).toHaveBeenCalledWith('generate-alt-text', {
      postId: 'post-1',
    });
    expect(mockFeedFanoutQueue.add).toHaveBeenCalledWith('distribute', {
      postId: 'post-1',
      authorId: 'author-1',
    });
  });

  it('does not enqueue feed fanout for private posts', async () => {
    const post = {
      id: 'post-2',
      profileId: 'author-1',
      visibility: Visibility.PRIVATE,
      media: [],
    };

    await service.dispatchPostPublished(post);

    expect(mockFeedFanoutQueue.add).not.toHaveBeenCalled();
    expect(mockAiQueue.add).toHaveBeenCalledTimes(3);
  });

  it('resolves mentions and emits notification events excluding self', async () => {
    mockPrisma.profile.findMany.mockResolvedValue([
      { id: 'user-2' },
      { id: 'user-3' },
    ]);

    const post = {
      id: 'post-3',
      profileId: 'user-1',
      visibility: Visibility.PUBLIC,
    };

    await service.dispatchPostPublished(post, {
      caption: 'Hello @user2 and @user3',
      uniqueMentions: ['user2', 'user3'],
    });

    expect(mockPrisma.profile.findMany).toHaveBeenCalledWith({
      where: {
        username: { in: ['user2', 'user3'] },
        id: { not: 'user-1' },
      },
      select: { id: true },
    });

    expect(mockEventEmitter.emit).toHaveBeenCalledTimes(2);
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('notification.create', {
      recipientId: 'user-2',
      senderId: 'user-1',
      type: 'MENTION',
      content: 'mentioned you in a post',
    });
  });
});
