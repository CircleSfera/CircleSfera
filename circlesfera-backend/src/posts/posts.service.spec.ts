/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { ContentRating, Visibility } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { assertVideoUrlDuration } from '../common/utils/media-duration.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { StoredFilesService } from '../uploads/services/stored-files.service.js';
import type { CreatePostDto } from './dto/create-post.dto.js';
import { PostsService } from './posts.service.js';
import { FrameCoverService } from './services/frame-cover.service.js';
import { PostDistributionService } from './services/post-distribution.service.js';
import { PostPaywallService } from './services/post-paywall.service.js';

// Every file in these tests is the sending Profile's own unless a test says so.
const mockStoredFiles = {
  assertOwnedBy: vi.fn().mockResolvedValue(undefined),
  record: vi.fn().mockResolvedValue(undefined),
  release: vi.fn().mockResolvedValue([]),
};

vi.mock('../common/utils/media-duration.util.js', () => ({
  assertVideoUrlDuration: vi.fn().mockResolvedValue(undefined),
}));

describe('PostsService', () => {
  let service: PostsService;

  const mockPrismaService = {
    user: { findMany: vi.fn().mockResolvedValue([]) },
    adminIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
    block: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
    // No comment unless a test says so.
    comment: { findMany: vi.fn().mockResolvedValue([]) },
    post: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    follow: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    postMedia: {
      createMany: vi.fn(),
      create: vi.fn(),
    },
    hashtag: {
      upsert: vi.fn().mockResolvedValue({ id: 'hash-1', name: 'world' }),
    },
    postHashtag: {
      create: vi.fn(),
    },
    place: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    audio: {
      findUnique: vi.fn(),
    },
    userSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };

  const mockAIService = {
    generateEmbedding: vi.fn(() => [0.1, 0.2, 0.3]),
    moderateContent: vi.fn().mockResolvedValue({
      isSafe: true,
      categories: {},
      reason: 'Safe content',
    }),
  };

  const mockPostPaywallService = {
    applyPaywall: vi.fn(async (posts) => posts),
  };

  const mockPostDistributionService = {
    dispatchPostPublished: vi.fn().mockResolvedValue(undefined),
  };

  const mockFrameCover = { choose: vi.fn() };
  const mockEventEmitter = { emit: vi.fn() };

  const mockAnalyticsService = {
    trackPostView: vi.fn().mockResolvedValue(undefined),
  };

  const mockSystemSettingsService = {
    isEnabled: vi.fn(async () => true),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StoredFilesService, useValue: mockStoredFiles },
        { provide: AIService, useValue: mockAIService },
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
        {
          provide: SystemSettingsService,
          useValue: mockSystemSettingsService,
        },
        { provide: PostPaywallService, useValue: mockPostPaywallService },
        {
          provide: PostDistributionService,
          useValue: mockPostDistributionService,
        },
        { provide: FrameCoverService, useValue: mockFrameCover },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it("refuses another Profile's stored file before creating anything", async () => {
      mockStoredFiles.assertOwnedBy.mockRejectedValueOnce(
        new Error('FILE_NOT_OWNED'),
      );
      const media = [
        {
          url: '/uploads/a.jpg',
          standardUrl: '/uploads/b.webp',
          thumbnailUrl: '/uploads/c.webp',
          type: 'IMAGE',
        },
      ];

      await expect(
        service.create('user-1', { caption: 'x', media } as never),
      ).rejects.toThrow('FILE_NOT_OWNED');
      expect(mockStoredFiles.assertOwnedBy).toHaveBeenCalledWith('user-1', [
        '/uploads/a.jpg',
        '/uploads/b.webp',
        '/uploads/c.webp',
      ]);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when content posting is disabled', async () => {
      mockSystemSettingsService.isEnabled.mockResolvedValueOnce(false);
      await expect(
        service.create('user-1', { caption: 'test' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a cover for a post that is not a frame, before creating it', async () => {
      await expect(
        service.create('user-1', { caption: 'test', coverTimeMs: 1000 }),
      ).rejects.toThrow('Only a frame has a cover to choose');
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockFrameCover.choose).not.toHaveBeenCalled();
    });

    it('validates premium price bounds when isPremium is true', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        accountType: 'CREATOR',
      });

      await expect(
        service.create('user-1', { isPremium: true, priceCents: 50 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create('user-1', { isPremium: true, priceCents: 200000 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create('user-1', { isPremium: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects premium posts from PERSONAL accounts', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        accountType: 'PERSONAL',
      });

      await expect(
        service.create('user-1', { isPremium: true, priceCents: 500 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('validates audio track exists and resolves offset when audioId provided', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.create('user-1', { audioId: 'missing-audio' }),
      ).rejects.toThrow('AUDIO_NOT_FOUND');

      mockPrismaService.audio.findUnique.mockResolvedValueOnce({
        id: 'aud-1',
        duration: 45,
      });

      const mockTx = {
        post: {
          create: vi.fn().mockResolvedValue({ id: 'post-aud' }),
        },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        media: { create: vi.fn(), createMany: vi.fn() },
        hashtag: {
          createMany: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]),
        },
        postHashtag: { create: vi.fn(), createMany: vi.fn() },
      };
      mockPrismaService.$transaction.mockImplementation(async (cb) =>
        cb(mockTx),
      );
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'post-aud',
        media: [],
      });

      const result = await service.create('user-1', {
        audioId: 'aud-1',
        audioStartMs: 5000,
      });
      expect(result).toBeDefined();
      expect(mockTx.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            audioId: 'aud-1',
            audioStartMs: 5000,
          }),
        }),
      );
    });

    it('saves the place and its names inside the post transaction', async () => {
      const mockTx = {
        post: { create: vi.fn().mockResolvedValue({ id: 'post-place' }) },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        media: { create: vi.fn(), createMany: vi.fn() },
        hashtag: {
          createMany: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
        },
        postHashtag: { create: vi.fn(), createMany: vi.fn() },
        place: {
          findUnique: vi.fn(),
          upsert: vi.fn().mockResolvedValue({
            id: 'place-1',
            name: 'Cádiz',
            fullName: 'Cádiz, España',
          }),
        },
        placeTranslation: { upsert: vi.fn() },
      };
      mockPrismaService.place.upsert.mockClear();
      mockPrismaService.$transaction.mockImplementation(async (cb) =>
        cb(mockTx),
      );
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'post-place',
        media: [],
      });

      await service.create('user-1', {
        place: {
          mapboxId: 'mapbox-1',
          name: 'Cádiz',
          fullName: 'Cádiz, España',
          latitude: 36.5,
          longitude: -6.3,
          translations: [{ locale: 'en', name: 'Cadiz' }],
        },
      });

      // Written through the transaction, so a failure leaves nothing behind.
      expect(mockTx.place.upsert).toHaveBeenCalledTimes(1);
      expect(mockTx.placeTranslation.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.place.upsert).not.toHaveBeenCalled();
      expect(mockTx.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ placeId: 'place-1' }),
        }),
      );
    });

    it('rejects FRAME when no media items provided', async () => {
      await expect(
        service.create('user-1', {
          type: 'FRAME',
          media: [],
        }),
      ).rejects.toThrow('FRAME_MEDIA_REQUIRED');
    });

    it('rejects a Frame that is not video', async () => {
      await expect(
        service.create('user-1', {
          type: 'FRAME',
          media: [{ url: 'url1', type: 'image' }],
        }),
      ).rejects.toThrow('FRAME_VIDEO_ONLY');
    });

    it('validates duration for FRAME video', async () => {
      const mockTx = {
        post: {
          create: vi.fn().mockResolvedValue({ id: 'frame-1' }),
        },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        media: { create: vi.fn(), createMany: vi.fn() },
        hashtag: {
          createMany: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]),
        },
        postHashtag: { create: vi.fn(), createMany: vi.fn() },
      };
      mockPrismaService.$transaction.mockImplementation(async (cb) =>
        cb(mockTx),
      );
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'frame-1',
        media: [{ url: 'https://vid.mp4', type: 'video' }],
      });

      await service.create('user-1', {
        type: 'FRAME',
        media: [{ url: 'https://vid.mp4', type: 'video' }],
        coverTimeMs: 2500,
      });

      expect(assertVideoUrlDuration).toHaveBeenCalledWith(
        'FRAME',
        'https://vid.mp4',
      );
      // The cover chosen while creating is asked for once the frame exists.
      expect(mockFrameCover.choose).toHaveBeenCalledWith('frame-1', 2500);
    });

    it('validates duration for POST video media items', async () => {
      const mockTx = {
        post: {
          create: vi.fn().mockResolvedValue({ id: 'post-vid' }),
        },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        media: { create: vi.fn(), createMany: vi.fn() },
        hashtag: {
          createMany: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]),
        },
        postHashtag: { create: vi.fn(), createMany: vi.fn() },
      };
      mockPrismaService.$transaction.mockImplementation(async (cb) =>
        cb(mockTx),
      );
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'post-vid',
        media: [{ url: 'https://vid.mp4', type: 'video' }],
      });

      await service.create('user-1', {
        type: 'POST',
        media: [{ url: 'https://vid.mp4', type: 'video' }],
      });

      expect(assertVideoUrlDuration).toHaveBeenCalledWith(
        'POST',
        'https://vid.mp4',
      );
    });

    it('throws BadRequestException when AI moderation flags content', async () => {
      mockAIService.moderateContent.mockResolvedValueOnce({
        flagged: true,
        reason: 'Violates policy',
      });

      await expect(
        service.create('user-1', {
          caption: 'Bad content',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('publishes the post when automatic moderation does not answer, and has it checked later', async () => {
      mockAIService.moderateContent.mockRejectedValueOnce(
        new Error('401 Incorrect API key provided'),
      );
      const mockTx = {
        post: { create: vi.fn().mockResolvedValue({ id: 'unchecked-post' }) },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        media: { create: vi.fn(), createMany: vi.fn() },
        hashtag: {
          createMany: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi.fn(),
        },
        postHashtag: { create: vi.fn(), createMany: vi.fn() },
      };
      mockPrismaService.$transaction.mockImplementation(async (cb) =>
        cb(mockTx),
      );
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'unchecked-post',
        media: [],
      });

      const result = await service.create('user-1', { caption: 'Hello' });

      expect(result).toMatchObject({ id: 'unchecked-post' });
      expect(
        mockPostDistributionService.dispatchPostPublished,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'unchecked-post' }),
        expect.objectContaining({ moderationUnchecked: true }),
      );
    });

    it('says the post was checked when automatic moderation answered', async () => {
      const mockTx = {
        post: { create: vi.fn().mockResolvedValue({ id: 'checked-post' }) },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        media: { create: vi.fn(), createMany: vi.fn() },
        hashtag: {
          createMany: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi.fn(),
        },
        postHashtag: { create: vi.fn(), createMany: vi.fn() },
      };
      mockPrismaService.$transaction.mockImplementation(async (cb) =>
        cb(mockTx),
      );
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'checked-post',
        media: [],
      });

      await service.create('user-1', { caption: 'Hello' });

      expect(
        mockPostDistributionService.dispatchPostPublished,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'checked-post' }),
        expect.objectContaining({ moderationUnchecked: false }),
      );
    });

    it('supports scheduled posts and defers distribution', async () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      const mockTx = {
        post: {
          create: vi.fn().mockResolvedValue({ id: 'scheduled-post' }),
        },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        media: { create: vi.fn(), createMany: vi.fn() },
        hashtag: {
          createMany: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]),
        },
        postHashtag: { create: vi.fn(), createMany: vi.fn() },
      };
      mockPrismaService.$transaction.mockImplementation(async (cb) =>
        cb(mockTx),
      );
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'scheduled-post',
        media: [],
        scheduledAt: new Date(futureDate),
        scheduledStatus: 'SCHEDULED',
      });

      const result = await service.create('user-1', {
        caption: 'Scheduled for later',
        scheduledAt: new Date(futureDate),
      });

      expect(result).toBeDefined();
      expect(
        mockPostDistributionService.dispatchPostPublished,
      ).not.toHaveBeenCalled();
    });

    it('should extract hashtags and mentions and run transaction', async () => {
      const profileId = 'user-1';
      const dto = {
        caption: 'Hello #world #alpha @user2',
        type: 'POST' as const,
        tags: [{ profileId: 'tagged-user', x: 0.1, y: 0.2 }],
        isPremium: true,
        priceCents: 500,
        contentRating: ContentRating.GENERAL,
        visibility: Visibility.PUBLIC,
      };

      const mockTx = {
        post: {
          create: vi.fn().mockResolvedValue({ id: 'post-1' }),
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValue({ id: 'post-1', media: [] }),
        },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        media: { create: vi.fn(), createMany: vi.fn() },
        hashtag: {
          createMany: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]),
        },
        postHashtag: { create: vi.fn(), createMany: vi.fn() },
      };

      mockPrismaService.$transaction.mockImplementation(
        async (
          callback: (tx: Partial<PrismaService>) => Promise<unknown>,
        ): Promise<unknown> =>
          callback(mockTx as unknown as Partial<PrismaService>),
      );

      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        accountType: 'CREATOR',
      });
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'post-1',
        caption: 'Hello #world #alpha @user2',
        media: [],
        author: { profile: { username: 'user1' } },
        _count: { likes: 0, comments: 0 },
      });

      const _result = await service.create(profileId, dto);

      expect(mockTx.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: {
              create: [{ profileId: 'tagged-user', x: 0.1, y: 0.2 }],
            },
          }),
        }),
      );
      // Hashtags are written in four batched statements, sorted by tag.
      expect(mockTx.hashtag.createMany).toHaveBeenCalledWith({
        data: [
          { tag: 'alpha', postCount: 0 },
          { tag: 'world', postCount: 0 },
        ],
        skipDuplicates: true,
      });
      expect(mockTx.hashtag.updateMany).toHaveBeenCalledWith({
        where: { tag: { in: ['alpha', 'world'] } },
        data: { postCount: { increment: 1 } },
      });
      expect(mockTx.postHashtag.createMany).toHaveBeenCalledWith({
        data: [
          { postId: 'post-1', hashtagId: 'tag-1' },
          { postId: 'post-1', hashtagId: 'tag-2' },
        ],
        skipDuplicates: true,
      });

      expect(
        mockPostDistributionService.dispatchPostPublished,
      ).toHaveBeenCalledWith(expect.objectContaining({ id: 'post-1' }), {
        caption: 'Hello #world #alpha @user2',
        uniqueMentions: ['user2'],
        moderationUnchecked: false,
      });
    });

    it('should create post with multiple media items', async () => {
      const profileId = 'user-1';
      const dto: CreatePostDto = {
        caption: 'Post with media',
        media: [
          { url: 'url1', type: 'image' },
          { url: 'url2', type: 'image' },
        ],
        type: 'POST',
      };

      const mockTx = {
        post: {
          create: vi.fn().mockResolvedValue({ id: 'post-1' }),
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValue({ id: 'post-1', media: [] }),
        },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        media: { create: vi.fn(), createMany: vi.fn() },
        hashtag: {
          createMany: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]),
        },
        postHashtag: { create: vi.fn(), createMany: vi.fn() },
      };

      mockPrismaService.$transaction.mockImplementation(
        async (
          callback: (tx: Partial<PrismaService>) => Promise<unknown>,
        ): Promise<unknown> =>
          callback(mockTx as unknown as Partial<PrismaService>),
      );

      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'post-multi',
        caption: 'Multi media post',
        media: [{ id: 'm1' }, { id: 'm2' }],
        author: { profile: { username: 'user1' } },
        _count: { likes: 0, comments: 0 },
      });

      await service.create(profileId, dto);

      // One batched insert for Media and one for PostMedia, linked by the
      // ids generated before the inserts.
      expect(mockTx.media.createMany).toHaveBeenCalledTimes(1);
      expect(mockTx.postMedia.createMany).toHaveBeenCalledTimes(1);
      expect(mockTx.media.create).not.toHaveBeenCalled();
      expect(mockTx.postMedia.create).not.toHaveBeenCalled();

      const mediaRows = mockTx.media.createMany.mock.calls[0][0].data;
      const postMediaRows = mockTx.postMedia.createMany.mock.calls[0][0].data;
      expect(mediaRows).toEqual([
        expect.objectContaining({
          kind: 'IMAGE',
          status: 'READY',
          url: 'url1',
        }),
        expect.objectContaining({
          kind: 'IMAGE',
          status: 'READY',
          url: 'url2',
        }),
      ]);
      expect(postMediaRows).toEqual([
        expect.objectContaining({
          postId: 'post-1',
          url: 'url1',
          type: 'image',
          order: 0,
        }),
        expect.objectContaining({
          postId: 'post-1',
          url: 'url2',
          type: 'image',
          order: 1,
        }),
      ]);
      expect(postMediaRows.map((r: { mediaId: string }) => r.mediaId)).toEqual(
        mediaRows.map((r: { id: string }) => r.id),
      );
      expect(new Set(mediaRows.map((r: { id: string }) => r.id)).size).toBe(2);
    });
  });

  describe('getByTag', () => {
    it('retrieves posts by hashtag with cursor pagination and injects isLiked', async () => {
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        {
          id: 'post-tag-1',
          caption: '#nature',
          likes: [{ profileId: 'user-1' }],
        },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(1);

      const result = await service.getByTag('nature', {
        page: 2,
        limit: 5,
        cursor: 'post-cursor',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].isLiked).toBe(false);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,
          take: 5,
          cursor: { id: 'post-cursor' },
        }),
      );
    });

    it('retrieves posts by hashtag with page-based offset without cursor', async () => {
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      const result = await service.getByTag('travel', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(0);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        }),
      );
    });

    it('lists nothing on the page of a hashtag hidden by staff, and counts nothing', async () => {
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      await service.getByTag('Spam', { page: 1, limit: 10 });

      const visible = { hashtag: { tag: 'spam', isHidden: false } };
      expect(
        mockPrismaService.post.findMany.mock.calls.at(-1)?.[0].where.hashtags
          .some,
      ).toEqual(visible);
      expect(
        mockPrismaService.post.count.mock.calls.at(-1)?.[0].where.hashtags.some,
      ).toEqual(visible);
    });
  });

  describe('findAll', () => {
    it('should return paginated posts with trending sort and currentProfileId', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([
        {
          id: '1',
          type: 'POST',
          profile: { profile: {} },
          media: [],
          likes: [{ profileId: 'current-user' }],
        },
      ]);
      mockPrismaService.post.count.mockResolvedValue(1);

      const result = await service.findAll(
        { page: 2, limit: 10, cursor: 'c-1' },
        'trending',
        'current-user',
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPostPaywallService.applyPaywall).toHaveBeenCalled();
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { likes: { _count: 'desc' } },
          cursor: { id: 'c-1' },
          skip: 1,
        }),
      );
    });

    it('handles posts when currentProfileId is undefined and sort is latest', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([]);
      mockPrismaService.post.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.meta.nextCursor).toBeUndefined();
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          skip: 0,
        }),
      );
    });
  });

  describe('getFramesFeed', () => {
    it('returns frames feed with currentProfileId and cursor', async () => {
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        {
          id: 'frame-1',
          type: 'FRAME',
          media: [],
          likes: [{ profileId: 'viewer-1' }],
        },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(1);

      const result = await service.getFramesFeed(
        { page: 1, limit: 5, cursor: 'prev-id' },
        'viewer-1',
      );

      expect(result.data).toHaveLength(1);
      expect(mockPostPaywallService.applyPaywall).toHaveBeenCalled();
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'FRAME' }),
          cursor: { id: 'prev-id' },
          skip: 1,
        }),
      );
    });

    it('returns frames feed when currentProfileId is omitted', async () => {
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      const result = await service.getFramesFeed({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException if post is not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows author to view post even if profile is private', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.PUBLIC,
        profile: {
          id: 'author-1',
          privacyLevel: Visibility.PRIVATE,
          user: {},
        },
        likes: [],
      });

      const post = await service.findOne('p-1', 'author-1');
      expect(post).toBeDefined();
      expect(mockAnalyticsService.trackPostView).toHaveBeenCalledWith(
        'p-1',
        'author-1',
      );
    });

    it('throws ForbiddenException if profile is private and viewer is not following', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.PUBLIC,
        profile: {
          id: 'author-1',
          privacyLevel: Visibility.PRIVATE,
          user: {},
        },
        likes: [],
      });

      await expect(service.findOne('p-1', undefined)).rejects.toThrow(
        'This account is private',
      );

      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.PUBLIC,
        profile: {
          id: 'author-1',
          privacyLevel: Visibility.PRIVATE,
          user: {},
        },
        likes: [],
      });
      mockPrismaService.follow.findUnique.mockResolvedValueOnce(null);

      await expect(service.findOne('p-1', 'other-user')).rejects.toThrow(
        'This account is private',
      );
    });

    it('allows viewer to view private profile post if follow is ACCEPTED', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.PUBLIC,
        profile: {
          id: 'author-1',
          privacyLevel: Visibility.PRIVATE,
          user: {},
        },
        likes: [],
      });
      mockPrismaService.follow.findUnique.mockResolvedValueOnce({
        status: 'ACCEPTED',
      });

      const post = await service.findOne('p-1', 'follower-1');
      expect(post).toBeDefined();
    });

    it('throws ForbiddenException if post visibility is PRIVATE and viewer is not author', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.PRIVATE,
        profile: {
          id: 'author-1',
          privacyLevel: Visibility.PUBLIC,
          user: {},
        },
        likes: [],
      });

      await expect(service.findOne('p-1', 'other-user')).rejects.toThrow(
        'This post is private',
      );
    });

    it('checks follower status when post visibility is FOLLOWERS', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.FOLLOWERS,
        profile: {
          id: 'author-1',
          privacyLevel: Visibility.PUBLIC,
          user: {},
        },
        likes: [],
      });
      await expect(service.findOne('p-1', undefined)).rejects.toThrow(
        'This post is for followers only',
      );

      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.FOLLOWERS,
        profile: {
          id: 'author-1',
          privacyLevel: Visibility.PUBLIC,
          user: {},
        },
        likes: [],
      });
      mockPrismaService.follow.findUnique.mockResolvedValueOnce({
        status: 'PENDING',
      });
      await expect(service.findOne('p-1', 'viewer-1')).rejects.toThrow(
        'This post is for followers only',
      );

      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.FOLLOWERS,
        profile: {
          id: 'author-1',
          privacyLevel: Visibility.PUBLIC,
          user: {},
        },
        likes: [{ profileId: 'viewer-1' }],
      });
      mockPrismaService.follow.findUnique.mockResolvedValueOnce({
        status: 'ACCEPTED',
      });
      const result = await service.findOne('p-1', 'viewer-1');
      expect(result.isLiked).toBe(true);
    });

    it('sanitizes _count.likes to null when hideLikes is true for a non-author viewer', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.PUBLIC,
        hideLikes: true,
        profile: {
          id: 'author-1',
          privacyLevel: Visibility.PUBLIC,
          user: {},
        },
        _count: { likes: 42, comments: 5 },
        likes: [],
      });
      const result = (await service.findOne('p-1', 'viewer-1')) as any;
      expect(result._count.likes).toBeNull();
      expect(result._count.comments).toBe(5);
    });

    it('preserves _count.likes when hideLikes is true for the author viewer', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.PUBLIC,
        hideLikes: true,
        profile: {
          id: 'author-1',
          privacyLevel: Visibility.PUBLIC,
          user: {},
        },
        _count: { likes: 42, comments: 5 },
        likes: [],
      });
      const result = (await service.findOne('p-1', 'author-1')) as any;
      expect(result._count.likes).toBe(42);
    });

    it('catches and logs error if analytics trackPostView fails', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-analytics',
        profileId: 'author-1',
        visibility: Visibility.PUBLIC,
        profile: {
          id: 'author-1',
          privacyLevel: Visibility.PUBLIC,
          user: {},
        },
        likes: [],
      });
      mockAnalyticsService.trackPostView.mockRejectedValueOnce(
        new Error('Redis down'),
      );

      const post = await service.findOne('p-analytics', 'author-1');
      expect(post).toBeDefined();
      await new Promise((resolve) => setImmediate(resolve));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to track view in findOne:',
        expect.any(Error),
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('findByUser', () => {
    it('throws NotFoundException when user is not found', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.findByUser('unknown', { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when target profile is private and viewer is not following', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'priv-user',
        privacyLevel: Visibility.PRIVATE,
        user: {},
      });
      await expect(
        service.findByUser('priv', { page: 1, limit: 10 }, undefined),
      ).rejects.toThrow('This account is private');

      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'priv-user',
        privacyLevel: Visibility.PRIVATE,
        user: {},
      });
      mockPrismaService.follow.findUnique.mockResolvedValueOnce({
        status: 'PENDING',
      });
      await expect(
        service.findByUser('priv', { page: 1, limit: 10 }, undefined, 'viewer'),
      ).rejects.toThrow('This account is private');
    });

    it('allows author or accepted follower to view posts with optional type filter', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        privacyLevel: Visibility.PUBLIC,
        user: {},
      });
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'post-1', profileId: 'user-1', likes: [{ id: 'l1' }] },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(1);

      const result = await service.findByUser(
        'username',
        { page: 2, limit: 10, cursor: 'c-user' },
        'FRAME',
        'user-1',
      );
      expect(result.data).toHaveLength(1);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            profileId: 'user-1',
            type: 'FRAME',
            // Their own grid leaves out what moderation removed.
            moderationStatus: { not: 'REMOVED' },
          }),
          skip: 1,
          cursor: { id: 'c-user' },
        }),
      );
    });

    it('constructs follower filter when viewer is logged in and not author', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'user-author',
        privacyLevel: Visibility.PUBLIC,
        user: {},
      });
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      const result = await service.findByUser(
        'username',
        { page: 1, limit: 10 },
        undefined,
        'viewer-2',
      );
      expect(result.data).toHaveLength(0);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            profileId: 'user-author',
            moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
          }),
        }),
      );
    });

    it('shows a guest no hidden, removed or mature posts on a Profile page', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'user-public',
        privacyLevel: Visibility.PUBLIC,
        user: {},
      });
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      await service.findByUser('username', { page: 1, limit: 10 });

      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visibility: Visibility.PUBLIC,
            moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
            contentRating: 'GENERAL',
          }),
        }),
      );
    });

    it('shows mature posts on a Profile page to a viewer who allows them, blurred if asked', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'user-author',
        privacyLevel: Visibility.PUBLIC,
        user: {},
      });
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        userId: 'viewer-user',
      });
      mockPrismaService.userSettings.findUnique.mockResolvedValueOnce({
        contentPreference: 'MATURE',
        blurSensitiveContent: true,
      });
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        {
          id: 'p-m',
          profileId: 'user-author',
          contentRating: 'MATURE',
          likes: [],
          media: [],
        },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(1);

      const result = await service.findByUser(
        'username',
        { page: 1, limit: 10 },
        undefined,
        'viewer-2',
      );

      const where =
        mockPrismaService.post.findMany.mock.calls.at(-1)?.[0].where;
      expect(where.contentRating).toBeUndefined();
      expect((result.data[0] as any).shouldBlurSensitive).toBe(true);
    });

    it('constructs public filter when viewer is not logged in', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'user-public',
        privacyLevel: Visibility.PUBLIC,
        user: {},
      });
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      const result = await service.findByUser('username', {
        page: 1,
        limit: 10,
      });
      expect(result.data).toHaveLength(0);
      expect(result.meta.nextCursor).toBeUndefined();
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            profileId: 'user-public',
            visibility: Visibility.PUBLIC,
          }),
        }),
      );
    });
  });

  describe('block and visibility rules', () => {
    const publicPost = {
      id: 'p-1',
      profileId: 'author-1',
      visibility: Visibility.PUBLIC,
      moderationStatus: 'VISIBLE',
      profile: {
        id: 'author-1',
        privacyLevel: Visibility.PUBLIC,
        user: {},
      },
      likes: [],
    };

    it('answers NotFound on post detail across a block', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce(publicPost);
      mockPrismaService.block.findFirst.mockResolvedValueOnce({ id: 'b1' });

      await expect(service.findOne('p-1', 'viewer-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('hides HIDDEN posts from everyone but the author, and REMOVED ones from the author too', async () => {
      for (const moderationStatus of ['HIDDEN', 'REMOVED']) {
        mockPrismaService.post.findUnique.mockResolvedValueOnce({
          ...publicPost,
          moderationStatus,
        });
        await expect(service.findOne('p-1', 'viewer-1')).rejects.toThrow(
          NotFoundException,
        );
      }

      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        ...publicPost,
        moderationStatus: 'HIDDEN',
      });
      await expect(service.findOne('p-1', 'author-1')).resolves.toBeDefined();

      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        ...publicPost,
        moderationStatus: 'REMOVED',
      });
      await expect(service.findOne('p-1', 'author-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('applies the public visibility filter, including blocks, to hashtag pages', async () => {
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      await service.getByTag('summer', { page: 1, limit: 10 }, 'viewer-1');

      const where =
        mockPrismaService.post.findMany.mock.calls.at(-1)?.[0].where;
      expect(where.hashtags).toBeDefined();
      // The viewer's own posts are listed too, but not a removed one.
      expect(where.OR[1]).toEqual({
        profileId: 'viewer-1',
        moderationStatus: { not: 'REMOVED' },
      });
      expect(where.OR[0]).toMatchObject({
        visibility: Visibility.PUBLIC,
        moderationStatus: 'VISIBLE',
        profile: {
          AND: [
            { privacyLevel: Visibility.PUBLIC },
            {
              user: { isTestAccount: false },
              blocking: { none: { blockedId: 'viewer-1' } },
              blockedBy: { none: { blockerId: 'viewer-1' } },
            },
          ],
        },
      });
    });

    it('answers NotFound for the tagged tab of a Profile in a block relation', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({ id: 'p-x' });
      mockPrismaService.block.findFirst.mockResolvedValueOnce({ id: 'b1' });

      await expect(
        service.getTaggedPosts('alice', { page: 1, limit: 10 }, 'viewer-1'),
      ).rejects.toThrow('User not found');
    });
  });

  describe('getTaggedPosts', () => {
    it('throws NotFoundException when profile is not found', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.getTaggedPosts('unknown', { page: 1, limit: 10 }),
      ).rejects.toThrow('User not found');
    });

    it('returns empty list for tagged posts when no posts match', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'prof-tagged',
      });
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      const result = await service.getTaggedPosts('alice', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(0);
      expect(result.meta.nextCursor).toBeUndefined();
    });

    it('returns paginated tagged posts with cursor and injects isLiked', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'prof-tagged',
      });
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        {
          id: 'post-tag-1',
          tags: [{ profileId: 'prof-tagged' }],
          likes: [],
        },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(1);

      const result = await service.getTaggedPosts('alice', {
        page: 2,
        limit: 10,
        cursor: 'c-tag',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].isLiked).toBe(false);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,
          cursor: { id: 'c-tag' },
        }),
      );
    });
  });

  describe('update', () => {
    it('should update post caption and visibility', async () => {
      mockPrismaService.post.update.mockResolvedValue({
        id: 'post-1',
        caption: 'new caption',
        visibility: Visibility.PUBLIC,
        media: [],
      });

      const result = await service.update('post-1', {
        caption: 'new caption',
        visibility: Visibility.PUBLIC,
      });
      expect(result.id).toBe('post-1');
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: {
          caption: 'new caption',
          visibility: Visibility.PUBLIC,
        },
        include: expect.any(Object),
      });
    });

    it('chooses the cover of a frame before changing its caption', async () => {
      const order: string[] = [];
      mockFrameCover.choose.mockImplementation(async () => {
        order.push('cover');
      });
      mockPrismaService.post.update.mockImplementation(async () => {
        order.push('caption');
        return { id: 'frame-1', media: [] };
      });

      await service.update('frame-1', { caption: 'New', coverTimeMs: 3000 });

      expect(mockFrameCover.choose).toHaveBeenCalledWith('frame-1', 3000);
      expect(order).toEqual(['cover', 'caption']);
    });

    it('takes a cover at the very start of the video', async () => {
      mockPrismaService.post.update.mockResolvedValue({
        id: 'frame-1',
        media: [],
      });

      await service.update('frame-1', { coverTimeMs: 0 });

      expect(mockFrameCover.choose).toHaveBeenCalledWith('frame-1', 0);
    });

    it('leaves the caption alone when the post has no cover to choose', async () => {
      mockFrameCover.choose.mockRejectedValue(
        new BadRequestException('Only a frame has a cover to choose'),
      );

      await expect(
        service.update('post-1', { caption: 'New', coverTimeMs: 3000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrismaService.post.update).not.toHaveBeenCalled();
    });

    it('does not touch the cover when none is asked for', async () => {
      mockPrismaService.post.update.mockResolvedValue({
        id: 'post-1',
        media: [],
      });

      await service.update('post-1', { caption: 'New' });

      expect(mockFrameCover.choose).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete post and trigger media cleanup', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        profileId: 'me',
        media: [{ url: 'https://cdn/img.jpg' }],
      });

      mockPrismaService.post.delete.mockResolvedValue({ id: 'post-1' });
      mockPrismaService.comment.findMany.mockResolvedValueOnce([
        {
          id: 'c-1',
          url: null,
          standardUrl: null,
          thumbnailUrl: null,
          voiceUrl: '/uploads/voice.webm',
          media: null,
          voiceMedia: null,
        },
      ]);

      const tx = {
        comment: { findMany: mockPrismaService.comment.findMany },
        post: { delete: vi.fn().mockResolvedValue({ id: 'post-1' }) },
        $queryRaw: vi.fn().mockResolvedValue([]),
      };
      mockPrismaService.$transaction.mockImplementationOnce((cb) => cb(tx));

      await service.remove('post-1');
      expect(tx.post.delete).toHaveBeenCalledWith({
        where: { id: 'post-1' },
      });
      // Locked before its comments are read: none can be added meanwhile.
      const [sql, id] = tx.$queryRaw.mock.calls[0];
      expect(sql.join('?')).toContain('FOR UPDATE');
      expect(id).toBe('post-1');
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        mockPrismaService.comment.findMany.mock.invocationCallOrder[0],
      );
      // Its comments go with it, and so are settled with its own files, in
      // the transaction that deletes the rows.
      expect(mockPrismaService.comment.findMany.mock.calls[0][0].where).toEqual(
        { postId: 'post-1' },
      );
      expect(mockStoredFiles.release).toHaveBeenCalledWith(
        '',
        ['https://cdn/img.jpg', undefined, undefined, '/uploads/voice.webm'],
        tx,
      );
    });

    it('fails, and so keeps the post, when its files cannot be settled', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        profileId: 'me',
        media: [],
      });
      mockPrismaService.$transaction.mockImplementationOnce((cb) =>
        cb({
          comment: { findMany: vi.fn().mockResolvedValue([]) },
          post: { delete: vi.fn() },
          $queryRaw: vi.fn(),
        }),
      );
      mockStoredFiles.release.mockRejectedValueOnce(new Error('db down'));

      await expect(service.remove('post-1')).rejects.toThrow('db down');
    });

    it('throws when the post is missing', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);
      mockPrismaService.post.delete.mockClear();
      await expect(service.remove('missing')).rejects.toThrow('Post not found');
      expect(mockPrismaService.post.delete).not.toHaveBeenCalled();
      expect(mockStoredFiles.release).not.toHaveBeenCalled();
    });
  });

  describe('adminRemove', () => {
    it('throws NotFoundException when post does not exist', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce(null);
      await expect(service.adminRemove('not-found', 'admin-1')).rejects.toThrow(
        'Post not found',
      );
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('marks the post removed, keeps it with its files and tells its author', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-admin',
      });
      mockPrismaService.post.update.mockResolvedValueOnce({
        id: 'p-admin',
        profileId: 'author-1',
        moderationStatus: 'REMOVED',
      });

      await service.adminRemove('p-admin', 'admin-1');
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 'p-admin' },
        data: {
          moderationStatus: 'REMOVED',
          moderationNote: undefined,
          moderatedAt: expect.any(Date),
        },
        select: { id: true, profileId: true, moderationStatus: true },
      });
      expect(mockPrismaService.post.delete).not.toHaveBeenCalled();
      expect(mockStoredFiles.release).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'author-1',
          type: 'MODERATION',
          postId: 'p-admin',
          targetType: 'post_removed',
          targetId: 'p-admin',
        }),
      );
    });
  });
});
