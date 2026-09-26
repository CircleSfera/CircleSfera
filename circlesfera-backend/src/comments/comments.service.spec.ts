import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeKeysetCursor } from '../common/pagination/keyset.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommentsService } from './comments.service.js';

describe('CommentsService', () => {
  let service: CommentsService;

  const mockPrismaService = {
    $transaction: vi.fn((cb) => cb(mockPrismaService)),
    post: {
      findUnique: vi.fn(),
    },
    comment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
    },
    commentLike: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    media: {
      create: vi.fn().mockResolvedValue({ id: 'media-1' }),
    },
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: 'BullQueue_ai-processing', useValue: { add: vi.fn() } },
        {
          provide: 'BullQueue_analytics-processing',
          useValue: { add: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const postId = 'post-1';
    const profileId = 'user-1';
    const dto = { content: 'Nice post! @user2' };

    it('should create a comment and notify post owner', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: postId,
        profileId: 'owner-1',
      });
      mockPrismaService.comment.create.mockResolvedValue({
        id: 'comment-1',
        content: dto.content,
      });
      mockPrismaService.profile.findMany.mockResolvedValue([{ id: 'user-2' }]);

      const result = await service.create(postId, profileId, dto);

      expect(result).toBeDefined();
      expect(mockPrismaService.comment.create).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'owner-1',
          type: 'COMMENT',
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'user-2',
          type: 'MENTION',
        }),
      );
    });

    it('should throw NotFoundException if post not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.create(postId, profileId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should notify parent comment owner if it is a reply', async () => {
      const replyDto = { content: 'Reply content', parentId: 'parent-1' };
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: postId,
        profileId: profileId,
      }); // Same user as post owner to avoid notification duplicate in test check
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: 'parent-1',
        profileId: 'parent-owner-1',
      });
      mockPrismaService.comment.create.mockResolvedValue({ id: 'comment-1' });

      await service.create(postId, profileId, replyDto);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          type: 'COMMENT',
          content: 'replied to your comment',
        }),
      );
    });

    it('should not notify parent comment owner if parent comment does not exist', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: postId,
        profileId: 'owner-post',
      });
      mockPrismaService.comment.create.mockResolvedValue({
        id: 'comment-1',
        postId,
        profileId,
      });
      mockPrismaService.comment.findUnique.mockResolvedValue(null);

      await service.create(postId, profileId, {
        content: 'reply to missing',
        parentId: 'missing-parent',
      });

      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({ content: 'replied to your comment' }),
      );
    });

    it('should handle voiceWaveform and mentioned users in comment', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: postId,
        profileId: 'owner-post',
      });
      mockPrismaService.comment.create.mockResolvedValue({
        id: 'comment-voice',
        postId,
        profileId,
      });
      mockPrismaService.profile.findMany.mockResolvedValue([
        { id: 'mentioned-user-1' },
      ]);

      await service.create(postId, profileId, {
        content: 'Check this out @user1',
        voiceWaveform: [0.1, 0.5, 0.8],
      });

      expect(mockPrismaService.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            voiceWaveform: [0.1, 0.5, 0.8],
          }),
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'mentioned-user-1',
          type: 'MENTION',
        }),
      );
    });

    it('creates linked Media rows for an image and a voice note, and links their ids', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: postId,
        profileId: 'owner-post',
      });
      mockPrismaService.media.create
        .mockResolvedValueOnce({ id: 'media-image-1' })
        .mockResolvedValueOnce({ id: 'media-voice-1' });
      mockPrismaService.comment.create.mockResolvedValue({
        id: 'comment-media',
        postId,
        profileId,
        media: {
          url: 'https://cdn/photo.jpg',
          standardUrl: null,
          thumbnailUrl: null,
          status: 'READY',
        },
        voiceMedia: { url: 'https://cdn/voice.m4a' },
      });

      const result = await service.create(postId, profileId, {
        content: 'photo + voice',
        url: 'https://cdn/photo.jpg',
        mediaType: 'image',
        voiceUrl: 'https://cdn/voice.m4a',
      });

      expect(mockPrismaService.media.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'IMAGE',
          status: 'READY',
          url: 'https://cdn/photo.jpg',
        }),
      });
      expect(mockPrismaService.media.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'AUDIO',
          status: 'READY',
          url: 'https://cdn/voice.m4a',
        }),
      });
      expect(mockPrismaService.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mediaId: 'media-image-1',
            voiceMediaId: 'media-voice-1',
          }),
        }),
      );
      expect(result.status).toBe('READY');
      expect(result.voiceUrl).toBe('https://cdn/voice.m4a');
      expect(result).not.toHaveProperty('media');
      expect(result).not.toHaveProperty('voiceMedia');
    });
  });

  describe('findByPost', () => {
    it('prefers the linked Media rows over inline columns, including for nested replies', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([
        {
          id: 'c1',
          url: 'https://cdn/stale.mp4',
          voiceUrl: null,
          media: {
            url: 'https://cdn/resolved.mp4',
            standardUrl: null,
            thumbnailUrl: null,
            status: 'PROCESSING',
          },
          voiceMedia: null,
          replies: [
            {
              id: 'r1',
              url: null,
              voiceUrl: 'https://cdn/stale-voice.m4a',
              media: null,
              voiceMedia: { url: 'https://cdn/resolved-voice.m4a' },
            },
          ],
        },
      ]);
      mockPrismaService.comment.count.mockResolvedValue(1);

      const result = await service.findByPost('post-1', {
        page: 1,
        limit: 10,
      });

      const [comment] = result.data as any[];
      expect(comment.url).toBe('https://cdn/resolved.mp4');
      expect(comment.status).toBe('PROCESSING');
      expect(comment).not.toHaveProperty('media');
      expect(comment).not.toHaveProperty('voiceMedia');
      expect(comment.replies[0].voiceUrl).toBe(
        'https://cdn/resolved-voice.m4a',
      );
      expect(comment.replies[0]).not.toHaveProperty('voiceMedia');
    });

    it('should return paginated comments', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([{ id: '1' }]);
      mockPrismaService.comment.count.mockResolvedValue(1);

      const result = await service.findByPost('post-1', { page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should use default page and limit when not specified in pagination', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([{ id: '1' }]);
      mockPrismaService.comment.count.mockResolvedValue(1);

      const result = await service.findByPost('post-1', {} as any);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });

    it('should include like state when currentProfileId is provided', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([
        { id: '1', likes: [{ id: 'like-1' }] },
      ]);
      mockPrismaService.comment.count.mockResolvedValue(1);

      const result = await service.findByPost(
        'post-1',
        { page: 1, limit: 10 },
        'viewer-profile',
      );
      expect(result.data).toHaveLength(1);
      expect(mockPrismaService.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            likes: {
              where: { profileId: 'viewer-profile' },
              take: 1,
              select: { id: true, profileId: true },
            },
          }),
        }),
      );
    });

    it('should decode an opaque cursor into a keyset WHERE clause without any DB lookup', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([{ id: 'c4' }]);
      mockPrismaService.comment.count.mockResolvedValue(50);
      const cursor = encodeKeysetCursor({
        createdAt: new Date('2026-01-05'),
        id: 'c5',
      });

      const result = await service.findByPost('post-1', {
        limit: 10,
        cursor,
      } as any);

      expect(mockPrismaService.comment.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 11,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          where: expect.objectContaining({
            postId: 'post-1',
            OR: [
              { createdAt: { lt: new Date('2026-01-05') } },
              { createdAt: new Date('2026-01-05'), id: { lt: 'c5' } },
            ],
          }),
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.nextCursor).toBeUndefined();
    });

    it('should degrade to the first page for a malformed cursor and compute nextCursor when a full extra row is fetched', async () => {
      const rows = Array.from({ length: 11 }, (_, i) => ({
        id: `c${i}`,
        createdAt: new Date(2026, 0, 11 - i),
      }));
      mockPrismaService.comment.findMany.mockResolvedValue(rows);
      mockPrismaService.comment.count.mockResolvedValue(100);

      const result = await service.findByPost('post-1', {
        limit: 10,
        cursor: 'not-a-valid-cursor',
      } as any);

      expect(mockPrismaService.comment.findUnique).not.toHaveBeenCalled();
      expect(result.data).toHaveLength(10);
      expect(result.meta.nextCursor).toBe(
        encodeKeysetCursor({ createdAt: new Date(2026, 0, 2), id: 'c9' }),
      );
    });

    it('should compute nextCursor on the page path when the page is full', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`,
        createdAt: new Date(2026, 0, 10 - i),
      }));
      mockPrismaService.comment.findMany.mockResolvedValue(rows);
      mockPrismaService.comment.count.mockResolvedValue(30);

      const result = await service.findByPost('post-1', {
        page: 1,
        limit: 10,
      });

      expect(result.meta.nextCursor).toBe(
        encodeKeysetCursor({ createdAt: new Date(2026, 0, 1), id: 'c9' }),
      );
    });
  });

  describe('remove', () => {
    it('should delete the comment', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: '1',
        profileId: 'user-1',
      });

      await service.remove('1');

      expect(mockPrismaService.comment.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should throw NotFoundException if comment does not exist', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(null);

      await expect(service.remove('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('likeComment', () => {
    it('should throw NotFoundException if comment not found', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(null);

      await expect(service.likeComment('c-1', 'p-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should like comment and emit notification if not self', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: 'c-1',
        profileId: 'owner-p',
        postId: 'post-1',
      });
      mockPrismaService.commentLike.findUnique.mockResolvedValue(null);

      await service.likeComment('c-1', 'liker-p');

      expect(mockPrismaService.commentLike.create).toHaveBeenCalledWith({
        data: { commentId: 'c-1', profileId: 'liker-p' },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'owner-p',
          senderId: 'liker-p',
        }),
      );
    });

    it('should like comment without notification if self-like', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: 'c-1',
        profileId: 'same-p',
        postId: 'post-1',
      });
      mockPrismaService.commentLike.findUnique.mockResolvedValue(null);

      await service.likeComment('c-1', 'same-p');

      expect(mockPrismaService.commentLike.create).toHaveBeenCalledWith({
        data: { commentId: 'c-1', profileId: 'same-p' },
      });
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should do nothing if comment already liked', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: 'c-1',
        profileId: 'owner-p',
      });
      mockPrismaService.commentLike.findUnique.mockResolvedValue({
        id: 'cl-1',
      });

      await service.likeComment('c-1', 'liker-p');

      expect(mockPrismaService.commentLike.create).not.toHaveBeenCalled();
    });
  });

  describe('unlikeComment', () => {
    it('should delete like if exists', async () => {
      mockPrismaService.commentLike.findUnique.mockResolvedValue({
        id: 'cl-1',
      });

      await service.unlikeComment('c-1', 'liker-p');

      expect(mockPrismaService.commentLike.delete).toHaveBeenCalledWith({
        where: { id: 'cl-1' },
      });
    });

    it('should do nothing if like does not exist', async () => {
      mockPrismaService.commentLike.findUnique.mockResolvedValue(null);

      await service.unlikeComment('c-1', 'liker-p');

      expect(mockPrismaService.commentLike.delete).not.toHaveBeenCalled();
    });
  });
});
