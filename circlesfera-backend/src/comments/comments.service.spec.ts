import { COMMENT_PINS_MAX } from '@circlesfera/shared';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeKeysetCursor } from '../common/pagination/keyset.util.js';
import { HiddenWordsService } from '../hidden-words/hidden-words.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActionLimitsService } from '../trust/action-limits.service.js';
import { StoredFilesService } from '../uploads/services/stored-files.service.js';
import { CommentsService } from './comments.service.js';

// Every file in these tests is the sending Profile's own unless a test says so.
const mockHiddenWords = { hides: vi.fn().mockResolvedValue(false) };
const mockStoredFiles = {
  assertOwnedBy: vi.fn().mockResolvedValue(undefined),
  record: vi.fn().mockResolvedValue(undefined),
  release: vi.fn().mockResolvedValue([]),
};

describe('CommentsService', () => {
  let service: CommentsService;

  // Default: an accessible public post.
  const accessiblePost = {
    id: 'post-1',
    profileId: 'author-1',
    visibility: 'PUBLIC',
    moderationStatus: 'VISIBLE',
    turnOffComments: false,
  };

  const mockPrismaService = {
    user: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((cb) => cb(mockPrismaService)),
    post: {
      findUnique: vi.fn(),
    },
    block: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    follow: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    comment: {
      create: vi.fn(),
      update: vi.fn(),
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
        {
          provide: ActionLimitsService,
          useValue: {
            consume: vi.fn().mockResolvedValue(undefined),
            trackWrite: vi.fn().mockResolvedValue(undefined),
            recordText: vi.fn().mockResolvedValue(undefined),
            clearRestricted: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StoredFilesService, useValue: mockStoredFiles },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: HiddenWordsService, useValue: mockHiddenWords },
        { provide: 'BullQueue_ai-processing', useValue: { add: vi.fn() } },
        {
          provide: 'BullQueue_analytics-processing',
          useValue: { add: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    vi.clearAllMocks();
    mockHiddenWords.hides.mockResolvedValue(false);
    mockPrismaService.post.findUnique
      .mockReset()
      .mockResolvedValue(accessiblePost);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it("refuses another Profile's stored file before creating anything", async () => {
      mockStoredFiles.assertOwnedBy.mockRejectedValueOnce(
        new Error('FILE_NOT_OWNED'),
      );

      await expect(
        service.create('post-1', 'viewer-1', {
          content: 'hi',
          url: '/uploads/a.jpg',
          voiceUrl: '/uploads/v.m4a',
        } as never),
      ).rejects.toThrow('FILE_NOT_OWNED');
      expect(mockStoredFiles.assertOwnedBy).toHaveBeenCalledWith('viewer-1', [
        '/uploads/a.jpg',
        '/uploads/v.m4a',
      ]);
      expect(mockPrismaService.comment.create).not.toHaveBeenCalled();
    });

    it('rejects comments across a block without creating anything', async () => {
      mockPrismaService.block.findFirst.mockResolvedValueOnce({ id: 'b1' });

      await expect(
        service.create('post-1', 'viewer-1', { content: 'hi' } as never),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.comment.create).not.toHaveBeenCalled();
    });

    it('rejects comments when turnOffComments is true', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        ...accessiblePost,
        turnOffComments: true,
      });

      await expect(
        service.create('post-1', 'viewer-1', { content: 'hello' } as never),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.comment.create).not.toHaveBeenCalled();
    });

    it('rejects comments on a followers-only post from a non-follower', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'post-1',
        profileId: 'author-1',
        visibility: 'FOLLOWERS',
        moderationStatus: 'VISIBLE',
      });

      await expect(
        service.create('post-1', 'viewer-1', { content: 'hi' } as never),
      ).rejects.toThrow();
      expect(mockPrismaService.comment.create).not.toHaveBeenCalled();
    });

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

    it("hides a comment with one of the post author's words, and tells nobody", async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: postId,
        profileId: 'owner-1',
      });
      mockPrismaService.comment.create.mockResolvedValue({
        id: 'comment-1',
        content: dto.content,
      });
      mockHiddenWords.hides.mockResolvedValue(true);

      await service.create(postId, profileId, dto);

      expect(mockHiddenWords.hides).toHaveBeenCalledWith(
        'owner-1',
        dto.content,
      );
      expect(mockPrismaService.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ hiddenByWords: true }),
        }),
      );
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it("never hides the post author's own comment", async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: postId,
        profileId,
      });
      mockPrismaService.comment.create.mockResolvedValue({ id: 'comment-1' });
      mockHiddenWords.hides.mockResolvedValue(true);

      await service.create(postId, profileId, dto);

      expect(mockHiddenWords.hides).not.toHaveBeenCalled();
      expect(mockPrismaService.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ hiddenByWords: false }),
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
          notice: { key: 'comment_replied' },
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
        expect.objectContaining({ notice: { key: 'comment_replied' } }),
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

  describe('comments hidden by words', () => {
    it('shows a hidden comment only to its writer, in the list, its replies and the count', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([]);
      mockPrismaService.comment.count.mockResolvedValue(0);

      await service.findByPost('post-1', { page: 1, limit: 10 }, 'viewer-1');
      const viewerWhere = (
        mockPrismaService.comment.findMany.mock.calls.at(-1) as any
      )[0];
      const notHidden = {
        OR: [{ hiddenByWords: false }, { profileId: 'viewer-1' }],
      };
      expect(viewerWhere.where.AND).toEqual([notHidden]);
      expect(viewerWhere.include.replies.where.AND).toEqual([notHidden]);
      const countWhere = (
        mockPrismaService.comment.count.mock.calls.at(-1) as any
      )[0].where;
      expect(countWhere.AND).toEqual([notHidden]);
      expect(countWhere.OR[1].parent.AND).toEqual([notHidden]);

      await service.findByPost('post-1', { page: 1, limit: 10 });
      const guestWhere = (
        mockPrismaService.comment.findMany.mock.calls.at(-1) as any
      )[0];
      expect(guestWhere.where.AND).toEqual([{ hiddenByWords: false }]);
    });

    it('lists the hidden comments of a post to its author only', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([{ id: 'h1' }]);

      await expect(
        service.hiddenByWordsOf('post-1', 'author-1'),
      ).resolves.toEqual({ data: [{ id: 'h1' }] });
      expect(
        (mockPrismaService.comment.findMany.mock.calls.at(-1) as any)[0].where,
      ).toEqual({
        postId: 'post-1',
        hiddenByWords: true,
        moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
      });

      await expect(
        service.hiddenByWordsOf('post-1', 'viewer-1'),
      ).rejects.toMatchObject({ response: { errorCode: 'FORBIDDEN_ACCESS' } });
    });

    it('lets the author show a hidden comment, and nobody else', async () => {
      (mockPrismaService.comment as any).updateMany = vi
        .fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(
        service.showHidden('post-1', 'c-1', 'author-1'),
      ).resolves.toEqual({ id: 'c-1', hiddenByWords: false });
      expect(
        (mockPrismaService.comment as any).updateMany,
      ).toHaveBeenCalledWith({
        where: { id: 'c-1', postId: 'post-1', hiddenByWords: true },
        data: { hiddenByWords: false },
      });
      await expect(
        service.showHidden('post-1', 'c-2', 'author-1'),
      ).rejects.toMatchObject({ response: { errorCode: 'COMMENT_NOT_FOUND' } });
      await expect(
        service.showHidden('post-1', 'c-1', 'viewer-1'),
      ).rejects.toMatchObject({ response: { errorCode: 'FORBIDDEN_ACCESS' } });
    });

    it('checks an edited comment again against the author words', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValueOnce({
        id: 'c-1',
        postId: 'post-1',
        profileId: 'viewer-1',
        moderationStatus: 'VISIBLE',
      });
      mockPrismaService.comment.update.mockResolvedValue({
        id: 'c-1',
        voiceMedia: null,
      });
      mockHiddenWords.hides.mockResolvedValue(true);

      await service.update('post-1', 'c-1', 'viewer-1', {
        content: 'feo @ana',
      });

      expect(mockHiddenWords.hides).toHaveBeenCalledWith(
        'author-1',
        'feo @ana',
      );
      expect(mockPrismaService.comment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ hiddenByWords: true }),
        }),
      );
      // Nobody mentioned in a hidden comment is told.
      expect(mockPrismaService.profile.findMany).not.toHaveBeenCalled();
    });

    it('pins no comment hidden by words', async () => {
      (mockPrismaService as any).$queryRaw = vi.fn();
      mockPrismaService.comment.findUnique.mockResolvedValueOnce({
        id: 'c-1',
        postId: 'post-1',
        parentId: null,
        pinnedAt: null,
        moderationStatus: 'VISIBLE',
        hiddenByWords: true,
      });

      await expect(
        service.pin('post-1', 'c-1', 'author-1'),
      ).rejects.toMatchObject({ response: { errorCode: 'COMMENT_NOT_FOUND' } });
    });
  });

  describe('pinned comments', () => {
    const shownComment = {
      id: 'c-1',
      postId: 'post-1',
      parentId: null,
      pinnedAt: null,
      moderationStatus: 'VISIBLE',
    };

    beforeEach(() => {
      (mockPrismaService as any).$queryRaw = vi.fn().mockResolvedValue([]);
      mockPrismaService.comment.findUnique.mockResolvedValue(shownComment);
      mockPrismaService.comment.update.mockImplementation(async ({ data }) => ({
        id: 'c-1',
        pinnedAt: data.pinnedAt,
      }));
    });

    it('lets the author of the post pin a comment, under the post lock', async () => {
      mockPrismaService.comment.count.mockResolvedValue(COMMENT_PINS_MAX - 1);

      const result = await service.pin('post-1', 'c-1', 'author-1');

      expect(result.pinnedAt).toBeInstanceOf(Date);
      expect((mockPrismaService as any).$queryRaw).toHaveBeenCalled();
      // A pin moderation took down does not hold a place.
      expect(mockPrismaService.comment.count).toHaveBeenCalledWith({
        where: {
          postId: 'post-1',
          parentId: null,
          pinnedAt: { not: null },
          moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
        },
      });
    });

    it('refuses a pin past the most a post can have', async () => {
      mockPrismaService.comment.count.mockResolvedValue(COMMENT_PINS_MAX);

      await expect(
        service.pin('post-1', 'c-1', 'author-1'),
      ).rejects.toMatchObject({ response: { errorCode: 'COMMENT_PINS_FULL' } });
      expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
    });

    it('refuses anyone but the author of the post', async () => {
      await expect(
        service.pin('post-1', 'c-1', 'viewer-1'),
      ).rejects.toMatchObject({ response: { errorCode: 'FORBIDDEN_ACCESS' } });
      await expect(
        service.unpin('post-1', 'c-1', 'viewer-1'),
      ).rejects.toMatchObject({ response: { errorCode: 'FORBIDDEN_ACCESS' } });
      expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
    });

    it('pins no reply, no comment of another post and none moderation hid', async () => {
      for (const other of [
        { ...shownComment, parentId: 'c-0' },
        { ...shownComment, postId: 'post-2' },
        { ...shownComment, moderationStatus: 'HIDDEN' },
        null,
      ]) {
        mockPrismaService.comment.findUnique.mockResolvedValueOnce(other);
        await expect(
          service.pin('post-1', 'c-1', 'author-1'),
        ).rejects.toMatchObject({
          response: { errorCode: 'COMMENT_NOT_FOUND' },
        });
      }
      expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
    });

    it('changes nothing when a pinned comment is pinned again', async () => {
      const at = new Date('2026-11-01T00:00:00Z');
      mockPrismaService.comment.findUnique.mockResolvedValue({
        ...shownComment,
        pinnedAt: at,
      });

      await expect(service.pin('post-1', 'c-1', 'author-1')).resolves.toEqual({
        id: 'c-1',
        pinnedAt: at,
      });
      expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
    });

    it('unpins a comment of the post', async () => {
      const result = await service.unpin('post-1', 'c-1', 'author-1');

      expect(result.pinnedAt).toBeNull();
      expect(mockPrismaService.comment.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { pinnedAt: null },
        select: { id: true, pinnedAt: true },
      });
    });

    it('shows the pinned comments first on the first page, and not again below', async () => {
      mockPrismaService.comment.findMany
        .mockResolvedValueOnce([{ id: 'pinned' }])
        .mockResolvedValueOnce([{ id: 'newest' }]);
      mockPrismaService.comment.count.mockResolvedValue(2);

      const result = await service.findByPost('post-1', { page: 1, limit: 10 });

      expect((result.data as any[]).map((c) => c.id)).toEqual([
        'pinned',
        'newest',
      ]);
      const [pinnedArgs, pageArgs] = mockPrismaService.comment.findMany.mock
        .calls as any[];
      expect(pinnedArgs[0].where.pinnedAt).toEqual({ not: null });
      expect(pinnedArgs[0].where.parentId).toBeNull();
      // Every shown pin: one shown again by moderation can be a fourth.
      expect(pinnedArgs[0].take).toBeUndefined();
      expect(pageArgs[0].where.pinnedAt).toBeNull();
    });

    it('does not repeat the pinned comments on a later page', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([{ id: 'older' }]);
      mockPrismaService.comment.count.mockResolvedValue(12);

      await service.findByPost('post-1', { page: 2, limit: 10 });

      expect(mockPrismaService.comment.findMany).toHaveBeenCalledTimes(1);
      expect(
        (mockPrismaService.comment.findMany.mock.calls[0] as any)[0].where
          .pinnedAt,
      ).toBeNull();
    });
  });

  describe('findByPost', () => {
    it('returns empty comments when turnOffComments is true and viewer is not author', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        ...accessiblePost,
        turnOffComments: true,
      });

      const result = await service.findByPost(
        'post-1',
        { page: 1, limit: 10 },
        'viewer-1',
      );
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(mockPrismaService.comment.findMany).not.toHaveBeenCalled();
    });

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
      // No pinned comment, then the page.
      mockPrismaService.comment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: '1' }]);
      mockPrismaService.comment.count.mockResolvedValue(1);

      const result = await service.findByPost('post-1', { page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('leaves out what moderation removed or hid, replies included, and counts what it lists', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([]);
      mockPrismaService.comment.count.mockResolvedValue(0);

      for (const cursor of [undefined, 'not-a-cursor']) {
        await service.findByPost(
          'post-1',
          { page: 1, limit: 10, cursor },
          'viewer-1',
        );
        const args = mockPrismaService.comment.findMany.mock.calls.at(-1)?.[0];
        const shown = { in: ['VISIBLE', 'FLAGGED'] };
        expect(args.where.moderationStatus).toEqual(shown);
        expect(args.include.replies.where.moderationStatus).toEqual(shown);
        const audience = args.where.profile;
        // Hidden ones too, for their author as for anyone, as the list does;
        // and a reply only under a comment the list shows.
        // Comments hidden by the author's words are left out too, but the
        // viewer's own.
        const notHidden = {
          OR: [{ hiddenByWords: false }, { profileId: 'viewer-1' }],
        };
        expect(mockPrismaService.comment.count).toHaveBeenLastCalledWith({
          where: {
            postId: 'post-1',
            profile: audience,
            moderationStatus: shown,
            AND: [notHidden],
            OR: [
              { parentId: null },
              {
                parent: {
                  parentId: null,
                  moderationStatus: shown,
                  profile: audience,
                  AND: [notHidden],
                },
              },
            ],
          },
        });
      }
    });

    it('should use default page and limit when not specified in pagination', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([{ id: '1' }]);
      mockPrismaService.comment.count.mockResolvedValue(1);

      const result = await service.findByPost('post-1', {} as any);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });

    it('should include like state when currentProfileId is provided', async () => {
      mockPrismaService.comment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: '1', likes: [{ id: 'like-1' }] }]);
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

      mockPrismaService.comment.findMany
        .mockResolvedValueOnce([
          {
            id: '1',
            url: '/uploads/photo.jpg',
            standardUrl: null,
            thumbnailUrl: null,
            voiceUrl: null,
            media: null,
            voiceMedia: null,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '2',
            url: null,
            standardUrl: null,
            thumbnailUrl: null,
            voiceUrl: '/uploads/reply.webm',
            media: null,
            voiceMedia: {
              url: '/uploads/reply.m4a',
              standardUrl: null,
              thumbnailUrl: null,
            },
          },
        ])
        .mockResolvedValueOnce([]);

      const tx = {
        comment: {
          findMany: mockPrismaService.comment.findMany,
          delete: vi.fn().mockResolvedValue({}),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
      };
      mockPrismaService.$transaction.mockImplementationOnce((cb) => cb(tx));

      await service.remove('1');

      expect(tx.comment.delete).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(mockPrismaService.comment.delete).not.toHaveBeenCalled();
      // Its replies go with it: their files are settled too, after the rows.
      expect(mockPrismaService.comment.findMany.mock.calls[1][0].where).toEqual(
        { parentId: { in: ['1'] } },
      );
      // Settled in the transaction that deletes the rows.
      expect(mockStoredFiles.release).toHaveBeenCalledWith(
        '',
        ['/uploads/photo.jpg', '/uploads/reply.webm', '/uploads/reply.m4a'],
        tx,
      );
      expect(tx.comment.delete.mock.invocationCallOrder[0]).toBeLessThan(
        mockStoredFiles.release.mock.invocationCallOrder[0],
      );
    });

    it('fails, and so keeps the comment, when its files cannot be settled', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({ id: '1' });
      mockPrismaService.comment.findMany.mockResolvedValueOnce([]);
      mockStoredFiles.release.mockRejectedValueOnce(new Error('db down'));

      await expect(service.remove('1')).rejects.toThrow('db down');
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

    it('answers a comment moderation removed as not found, and likes nothing', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: 'c-1',
        postId: 'post-1',
        profileId: 'author-1',
        moderationStatus: 'REMOVED',
      });

      await expect(service.likeComment('c-1', 'p-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.commentLike.create).not.toHaveBeenCalled();
    });

    it('rejects liking a comment across a block without creating anything', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: 'c-1',
        profileId: 'owner-p',
        postId: 'post-1',
      });
      // The post author is not blocked; the comment author is.
      mockPrismaService.block.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'b1' });

      await expect(service.likeComment('c-1', 'liker-p')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.commentLike.create).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
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
        postId: 'post-1',
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

  describe('update', () => {
    it('rejects editing a comment across a block', async () => {
      mockPrismaService.block.findFirst.mockResolvedValueOnce({ id: 'b1' });

      await expect(
        service.update('post-1', 'c-1', 'viewer-1', { content: 'edited' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
    });

    it('rejects editing a non-existent comment', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.update('post-1', 'c-1', 'author-1', { content: 'edited' }),
      ).rejects.toThrow('Comment not found');
      expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
    });

    it('rejects editing a comment moderation removed, also by its author', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValueOnce({
        id: 'c-1',
        postId: 'post-1',
        profileId: 'author-1',
        moderationStatus: 'REMOVED',
      });

      await expect(
        service.update('post-1', 'c-1', 'author-1', { content: 'edited' }),
      ).rejects.toThrow('Comment not found');
      expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
    });

    it('rejects editing when comment belongs to a different post', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValueOnce({
        id: 'c-1',
        postId: 'post-other',
        profileId: 'author-1',
      });

      await expect(
        service.update('post-1', 'c-1', 'author-1', { content: 'edited' }),
      ).rejects.toThrow('Comment not found');
      expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
    });

    it('rejects editing when viewer is not the comment author', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValueOnce({
        id: 'c-1',
        postId: 'post-1',
        profileId: 'different-author',
      });

      await expect(
        service.update('post-1', 'c-1', 'attacker-profile', {
          content: 'edited',
        }),
      ).rejects.toThrow('You cannot edit this comment');
      expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
    });

    it('successfully edits comment and sets isEdited to true without time limit', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValueOnce({
        id: 'c-1',
        postId: 'post-1',
        profileId: 'author-1',
        content: 'Original comment posted long ago',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      mockPrismaService.comment.update.mockResolvedValueOnce({
        id: 'c-1',
        postId: 'post-1',
        profileId: 'author-1',
        content: 'Updated comment text',
        isEdited: true,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date(),
      });

      const result = await service.update('post-1', 'c-1', 'author-1', {
        content: 'Updated comment text',
      });

      expect(mockPrismaService.comment.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: {
          content: 'Updated comment text',
          isEdited: true,
        },
        include: expect.any(Object),
      });
      expect(result.content).toBe('Updated comment text');
      expect(result.isEdited).toBe(true);
    });

    it('notifies profiles mentioned in an edited comment, except across a block', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValueOnce({
        id: 'c-1',
        postId: 'post-1',
        profileId: 'commenter-1',
      });
      mockPrismaService.comment.update.mockResolvedValueOnce({
        id: 'c-1',
        postId: 'post-1',
        profileId: 'commenter-1',
        content: 'hey @alice and @bob, also @alice',
        isEdited: true,
      });
      mockPrismaService.profile.findMany.mockResolvedValueOnce([
        { id: 'alice-p' },
        { id: 'bob-p' },
      ]);
      // Only bob is across a block from the commenter.
      mockPrismaService.block.findFirst.mockImplementation(
        async (args: unknown) =>
          JSON.stringify(args).includes('bob-p') ? { id: 'b1' } : null,
      );

      await service.update('post-1', 'c-1', 'commenter-1', {
        content: 'hey @alice and @bob, also @alice',
      });
      mockPrismaService.block.findFirst.mockReset().mockResolvedValue(null);

      expect(mockPrismaService.profile.findMany).toHaveBeenCalledWith({
        where: {
          username: { in: ['alice', 'bob'] },
          id: { notIn: ['commenter-1', 'author-1'] },
        },
        select: { id: true },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'alice-p',
          senderId: 'commenter-1',
          type: 'MENTION',
          postId: 'post-1',
        }),
      );
    });
  });
});
