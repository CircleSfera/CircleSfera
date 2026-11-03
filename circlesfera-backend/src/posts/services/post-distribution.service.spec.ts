import type { EventEmitter2 } from '@nestjs/event-emitter';
import { Visibility } from '@prisma/client';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import {
  PostDistributionService,
  UNCHECKED_MODERATION_RETRY,
} from './post-distribution.service.js';

describe('PostDistributionService', () => {
  let service: PostDistributionService;
  let mockPrisma: {
    profile: { findMany: ReturnType<typeof vi.fn> };
    post: { findUnique: ReturnType<typeof vi.fn> };
  };
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };
  let mockAiQueue: { add: ReturnType<typeof vi.fn> };
  let mockFeedFanoutQueue: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPrisma = {
      profile: { findMany: vi.fn() },
      post: { findUnique: vi.fn() },
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

  it('keeps checking a post published while automatic moderation did not answer, until it does', async () => {
    const post = {
      id: 'post-2',
      profileId: 'author-1',
      visibility: Visibility.PUBLIC,
      media: [],
    };

    await service.dispatchPostPublished(post, {
      caption: 'Published while the check was down',
      moderationUnchecked: true,
    });

    expect(mockAiQueue.add).toHaveBeenCalledWith(
      'moderate-content',
      {
        targetId: 'post-2',
        text: 'Published while the check was down',
        targetType: 'POST',
        mediaUrls: [],
      },
      UNCHECKED_MODERATION_RETRY,
    );
    expect(UNCHECKED_MODERATION_RETRY.attempts).toBeGreaterThan(4);
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
      notice: { key: 'mentioned_in_post' },
    });
  });

  describe('a scheduled post, once it goes out', () => {
    it('does what a post shared at once does, read from the saved post', async () => {
      mockPrisma.post.findUnique.mockResolvedValue({
        id: 'post-4',
        profileId: 'author-1',
        visibility: Visibility.FOLLOWERS,
        caption: 'Hola @ana y @ana.b',
        media: [
          // The processed media wins over the address saved with the post.
          {
            url: 'https://cdn/raw.mp4',
            thumbnailUrl: null,
            media: {
              url: 'https://cdn/v.mp4',
              thumbnailUrl: 'https://cdn/v.jpg',
            },
            stickers: [],
          },
          {
            url: 'https://cdn/2.jpg',
            thumbnailUrl: null,
            media: null,
            stickers: [],
          },
        ],
      });
      mockPrisma.profile.findMany.mockResolvedValue([{ id: 'ana-id' }]);

      await service.dispatchScheduledPostPublished('post-4');

      expect(mockAiQueue.add).toHaveBeenCalledWith('moderate-content', {
        targetId: 'post-4',
        text: 'Hola @ana y @ana.b',
        targetType: 'POST',
        mediaUrls: ['https://cdn/v.jpg', 'https://cdn/2.jpg'],
      });
      expect(mockFeedFanoutQueue.add).toHaveBeenCalledWith('distribute', {
        postId: 'post-4',
        authorId: 'author-1',
      });
      expect(mockPrisma.profile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            username: { in: ['ana', 'ana.b'] },
            id: { not: 'author-1' },
          },
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({ recipientId: 'ana-id', type: 'MENTION' }),
      );
    });

    it('does nothing for a post deleted before it went out', async () => {
      mockPrisma.post.findUnique.mockResolvedValue(null);

      await service.dispatchScheduledPostPublished('gone');

      expect(mockAiQueue.add).not.toHaveBeenCalled();
      expect(mockFeedFanoutQueue.add).not.toHaveBeenCalled();
    });
  });

  it('checks an edited caption again with the moderation job', async () => {
    await service.moderateEditedCaption('post-9', 'a new caption');

    expect(mockAiQueue.add).toHaveBeenCalledWith('moderate-content', {
      targetId: 'post-9',
      text: 'a new caption',
      targetType: 'POST',
    });
  });

  describe('the profiles the stickers on its photos mention', () => {
    const post = {
      id: 'post-5',
      profileId: 'author-1',
      visibility: Visibility.FOLLOWERS,
      media: [],
    };
    // A post for followers: who follows sees it, who does not is not told.
    const extra = {
      block: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      follow: {
        findUnique: vi.fn(async ({ where }) =>
          where.followerId_followingId.followerId === 'ana'
            ? { status: 'ACCEPTED' }
            : null,
        ),
      },
    };

    beforeEach(() => {
      Object.assign(mockPrisma, extra);
      mockPrisma.post.findUnique.mockResolvedValue({
        id: 'post-5',
        profileId: 'author-1',
        visibility: Visibility.FOLLOWERS,
        moderationStatus: 'VISIBLE',
        deletedAt: null,
        archivedAt: null,
        turnOffComments: false,
        profile: { privacyLevel: Visibility.PUBLIC },
      });
    });

    it('are told once each, linking the post, only when they can see it', async () => {
      mockPrisma.profile.findMany.mockResolvedValue([{ id: 'luis' }]);

      await service.dispatchPostPublished(post, {
        caption: 'con @luis',
        uniqueMentions: ['luis'],
        stickerMentions: ['ana', 'luis', 'stranger', 'author-1'],
      });

      const told = mockEventEmitter.emit.mock.calls.map(([, p]) => p);
      expect(told).toEqual([
        {
          recipientId: 'luis',
          senderId: 'author-1',
          type: 'MENTION',
          notice: { key: 'mentioned_in_post' },
        },
        {
          recipientId: 'ana',
          senderId: 'author-1',
          type: 'MENTION',
          notice: { key: 'mentioned_in_post' },
          postId: 'post-5',
        },
      ]);
    });

    it('are read from the saved post when a scheduled post goes out', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce({
        ...post,
        caption: null,
        media: [
          {
            url: 'https://cdn/1.jpg',
            thumbnailUrl: null,
            media: null,
            stickers: [
              { settings: { profileId: 'ana' } },
              { settings: { profileId: 'author-1' } },
            ],
          },
          {
            url: 'https://cdn/2.jpg',
            thumbnailUrl: null,
            media: null,
            stickers: [{ settings: { profileId: 'ana' } }, { settings: null }],
          },
        ],
      });

      await service.dispatchScheduledPostPublished('post-5');

      expect(
        mockPrisma.post.findUnique.mock.calls[0][0].select.media.select
          .stickers,
      ).toEqual({ where: { kind: 'MENTION' }, select: { settings: true } });
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({ recipientId: 'ana', postId: 'post-5' }),
      );
    });
  });
});
