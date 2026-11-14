import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { FeedPreferencesService } from './feed-preferences.service.js';

describe('FeedPreferencesService', () => {
  let service: FeedPreferencesService;
  let mockPrisma: {
    post: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    profile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    feedHiddenPost: {
      upsert: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    feedHiddenAuthor: {
      upsert: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    feedMutedKeyword: {
      upsert: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      post: {
        findUnique: vi.fn(),
      },
      profile: {
        findUnique: vi.fn(),
      },
      feedHiddenPost: {
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      feedHiddenAuthor: {
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      feedMutedKeyword: {
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    service = new FeedPreferencesService(
      mockPrisma as unknown as PrismaService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hidePost and unhidePost', () => {
    it('throws NotFoundException if post does not exist', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce(null);

      await expect(service.hidePost('viewer-1', 'post-404')).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException for a post in its author's Recently deleted", async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce({
        id: 'post-gone',
        profileId: 'author-2',
        deletedAt: new Date(),
      });

      await expect(service.hidePost('viewer-1', 'post-gone')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.feedHiddenPost.upsert).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if user tries to hide their own post', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce({
        id: 'post-mine',
        profileId: 'viewer-1',
      });

      await expect(service.hidePost('viewer-1', 'post-mine')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('upserts hidden post successfully', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce({
        id: 'post-other',
        profileId: 'author-2',
      });

      const res = await service.hidePost('viewer-1', 'post-other');
      expect(res).toEqual({ success: true });
      expect(mockPrisma.feedHiddenPost.upsert).toHaveBeenCalledWith({
        where: {
          profileId_postId: { profileId: 'viewer-1', postId: 'post-other' },
        },
        update: {},
        create: { profileId: 'viewer-1', postId: 'post-other' },
      });
    });

    it('unhides post successfully', async () => {
      const res = await service.unhidePost('viewer-1', 'post-1');
      expect(res).toEqual({ success: true });
      expect(mockPrisma.feedHiddenPost.deleteMany).toHaveBeenCalledWith({
        where: { profileId: 'viewer-1', postId: 'post-1' },
      });
    });
  });

  describe('hideAuthor and unhideAuthor', () => {
    it('throws BadRequestException if user tries to hide themselves', async () => {
      await expect(service.hideAuthor('user-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException if author does not exist', async () => {
      mockPrisma.profile.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.hideAuthor('viewer-1', 'author-404'),
      ).rejects.toThrow(NotFoundException);
    });

    it('upserts hidden author successfully', async () => {
      mockPrisma.profile.findUnique.mockResolvedValueOnce({ id: 'author-2' });

      const res = await service.hideAuthor('viewer-1', 'author-2');
      expect(res).toEqual({ success: true });
      expect(mockPrisma.feedHiddenAuthor.upsert).toHaveBeenCalledWith({
        where: {
          profileId_authorId: { profileId: 'viewer-1', authorId: 'author-2' },
        },
        update: {},
        create: { profileId: 'viewer-1', authorId: 'author-2' },
      });
    });

    it('unhides author successfully', async () => {
      const res = await service.unhideAuthor('viewer-1', 'author-2');
      expect(res).toEqual({ success: true });
      expect(mockPrisma.feedHiddenAuthor.deleteMany).toHaveBeenCalledWith({
        where: { profileId: 'viewer-1', authorId: 'author-2' },
      });
    });
  });

  describe('muteKeyword and unmuteKeyword', () => {
    it('throws BadRequestException when keyword length is invalid', async () => {
      await expect(service.muteKeyword('viewer-1', 'a')).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.muteKeyword('viewer-1', 'a'.repeat(65)),
      ).rejects.toThrow(BadRequestException);
    });

    it('upserts muted keyword in lowercase trimmed form', async () => {
      const res = await service.muteKeyword('viewer-1', '  CryptoTrading  ');
      expect(res).toEqual({ success: true, keyword: 'cryptotrading' });
      expect(mockPrisma.feedMutedKeyword.upsert).toHaveBeenCalledWith({
        where: {
          profileId_keyword: {
            profileId: 'viewer-1',
            keyword: 'cryptotrading',
          },
        },
        update: {},
        create: { profileId: 'viewer-1', keyword: 'cryptotrading' },
      });
    });

    it('unmutes keyword successfully', async () => {
      const res = await service.unmuteKeyword('viewer-1', 'CryptoTrading');
      expect(res).toEqual({ success: true });
      expect(mockPrisma.feedMutedKeyword.deleteMany).toHaveBeenCalledWith({
        where: { profileId: 'viewer-1', keyword: 'cryptotrading' },
      });
    });
  });

  describe('listPreferences', () => {
    it('returns structured preferences with media fallback coverage', async () => {
      const createdAt = new Date();
      mockPrisma.feedHiddenPost.findMany.mockResolvedValueOnce([
        {
          postId: 'p1',
          createdAt,
          post: {
            caption: 'Post 1',
            media: [{ thumbnailUrl: 'thumb.jpg' }],
            profile: { username: 'alice', avatar: 'alice.png' },
          },
        },
        {
          postId: 'p2',
          createdAt,
          post: {
            caption: null,
            media: [{ standardUrl: 'std.jpg' }],
            profile: null,
          },
        },
        {
          postId: 'p3',
          createdAt,
          post: {
            caption: 'Post 3',
            media: [{ url: 'raw.jpg' }],
            profile: { username: 'bob', avatar: null },
          },
        },
        {
          postId: 'p4',
          createdAt,
          post: null,
        },
      ]);

      mockPrisma.feedHiddenAuthor.findMany.mockResolvedValueOnce([
        {
          authorId: 'auth-1',
          createdAt,
          author: { id: 'auth-1', username: 'carol', avatar: 'carol.jpg' },
        },
      ]);

      mockPrisma.feedMutedKeyword.findMany.mockResolvedValueOnce([
        { keyword: 'spam', createdAt },
      ]);

      const res = await service.listPreferences('viewer-1');

      expect(res.hiddenPosts).toHaveLength(4);
      expect(res.hiddenPosts[0].thumbnailUrl).toBe('thumb.jpg');
      expect(res.hiddenPosts[1].thumbnailUrl).toBe('std.jpg');
      expect(res.hiddenPosts[2].thumbnailUrl).toBe('raw.jpg');
      expect(res.hiddenPosts[3].thumbnailUrl).toBeNull();
      expect(res.hiddenAuthors).toHaveLength(1);
      expect(res.mutedKeywords).toHaveLength(1);
    });
  });

  describe('getFilterSets', () => {
    it('returns sets of hidden posts, authors, and muted keywords', async () => {
      mockPrisma.feedHiddenPost.findMany.mockResolvedValueOnce([
        { postId: 'p-1' },
        { postId: 'p-2' },
      ]);
      mockPrisma.feedHiddenAuthor.findMany.mockResolvedValueOnce([
        { authorId: 'a-1' },
      ]);
      mockPrisma.feedMutedKeyword.findMany.mockResolvedValueOnce([
        { keyword: 'ad' },
      ]);

      const filters = await service.getFilterSets('viewer-1');

      expect(filters).toEqual({
        hiddenPostIds: ['p-1', 'p-2'],
        hiddenAuthorIds: ['a-1'],
        mutedKeywords: ['ad'],
      });
    });
  });

  describe('listPage', () => {
    const at = new Date('2026-10-18T10:00:00.000Z');

    it('reads one more than the page to know whether another follows, and gives a cursor', async () => {
      mockPrisma.feedMutedKeyword.findMany.mockResolvedValueOnce([
        { id: 'k1', keyword: 'alpha', createdAt: at },
        { id: 'k2', keyword: 'bravo', createdAt: at },
        { id: 'k3', keyword: 'charlie', createdAt: at },
      ]);

      const page = await service.listPage(
        'viewer-1',
        'muted-keywords',
        undefined,
        2,
      );

      expect(mockPrisma.feedMutedKeyword.findMany).toHaveBeenCalledWith({
        where: { profileId: 'viewer-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
      });
      expect(page.items).toEqual([
        { keyword: 'alpha', createdAt: at },
        { keyword: 'bravo', createdAt: at },
      ]);
      const next = await service.listPage(
        'viewer-1',
        'muted-keywords',
        page.nextCursor as string,
        2,
      );
      expect(next.nextCursor).toBeNull();
      expect(mockPrisma.feedMutedKeyword.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            profileId: 'viewer-1',
            OR: [
              { createdAt: { lt: at } },
              { createdAt: at, id: { lt: 'k2' } },
            ],
          },
        }),
      );
    });

    it('starts from the top with a cursor it did not give, and keeps the page within bounds', async () => {
      await service.listPage('viewer-1', 'hidden-authors', 'not-a-cursor', 500);

      expect(mockPrisma.feedHiddenAuthor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { profileId: 'viewer-1' }, take: 51 }),
      );
    });

    it('gives hidden authors with their Profile', async () => {
      mockPrisma.feedHiddenAuthor.findMany.mockResolvedValueOnce([
        {
          id: 'h1',
          authorId: 'author-2',
          createdAt: at,
          author: { id: 'author-2', username: 'marta', avatar: null },
        },
      ]);

      const page = await service.listPage('viewer-1', 'hidden-authors');

      expect(page).toEqual({
        items: [
          {
            authorId: 'author-2',
            username: 'marta',
            avatar: null,
            createdAt: at,
          },
        ],
        nextCursor: null,
      });
    });

    it('gives hidden posts with their picture and author, whatever is missing', async () => {
      mockPrisma.feedHiddenPost.findMany.mockResolvedValueOnce([
        {
          id: 'p1',
          postId: 'post-1',
          createdAt: at,
          post: {
            caption: 'Sunset',
            media: [{ url: 'u', thumbnailUrl: null, standardUrl: 's' }],
            profile: { username: 'marta', avatar: 'a' },
          },
        },
        { id: 'p2', postId: 'post-2', createdAt: at, post: null },
      ]);

      const page = await service.listPage(
        'viewer-1',
        'hidden-posts',
        undefined,
        1,
      );

      expect(page.items).toEqual([
        {
          postId: 'post-1',
          createdAt: at,
          caption: 'Sunset',
          thumbnailUrl: 's',
          authorUsername: 'marta',
          authorAvatar: 'a',
        },
      ]);
      expect(page.nextCursor).not.toBeNull();
      mockPrisma.feedHiddenPost.findMany.mockResolvedValueOnce([
        { id: 'p2', postId: 'post-2', createdAt: at, post: null },
      ]);
      const rest = await service.listPage('viewer-1', 'hidden-posts');
      expect(rest.items).toEqual([
        {
          postId: 'post-2',
          createdAt: at,
          caption: null,
          thumbnailUrl: null,
          authorUsername: null,
          authorAvatar: null,
        },
      ]);
    });
  });
});
