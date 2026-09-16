import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { PostPaywallService } from './post-paywall.service.js';

describe('PostPaywallService', () => {
  let service: PostPaywallService;
  let mockPrisma: {
    profile: { findUnique: ReturnType<typeof vi.fn> };
    postUnlock: { findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    mockPrisma = {
      profile: { findUnique: vi.fn() },
      postUnlock: { findMany: vi.fn() },
    };
    service = new PostPaywallService(mockPrisma as unknown as PrismaService);
  });

  it('returns empty array when given empty posts', async () => {
    const result = await service.applyPaywall([]);
    expect(result).toEqual([]);
  });

  it('leaves non-premium posts untouched for guests', async () => {
    const posts = [
      {
        id: 'p1',
        profileId: 'u1',
        isPremium: false,
        media: [{ id: 'm1', url: 'https://cdn/img.jpg' }],
      },
    ];
    const result = await service.applyPaywall(posts);
    expect(result[0].isLocked).toBeUndefined();
    expect(result[0].media?.[0].url).toBe('https://cdn/img.jpg');
  });

  it('locks premium posts and builds teaser URLs for guests', async () => {
    const posts = [
      {
        id: 'p1',
        profileId: 'u1',
        isPremium: true,
        media: [
          {
            id: 'm1',
            url: 'https://cdn/post_123.mp4',
            standardUrl: 'https://cdn/post_123.m3u8',
          },
        ],
      },
    ];
    const result = await service.applyPaywall(posts);
    expect(result[0].isLocked).toBe(true);
    expect(result[0].media?.[0].url).toBe('/media/teaser/m1/post_123.mp4');
    expect(result[0].media?.[0].standardUrl).toBe(
      '/media/teaser/m1/master.m3u8',
    );
  });

  it('does not lock own premium posts for the author', async () => {
    mockPrisma.profile.findUnique.mockResolvedValue({ userId: 'user-1' });
    mockPrisma.postUnlock.findMany.mockResolvedValue([]);

    const posts = [
      {
        id: 'p1',
        profileId: 'author-1',
        isPremium: true,
        media: [{ id: 'm1', url: 'https://cdn/video.mp4' }],
      },
    ];
    const result = await service.applyPaywall(posts, 'author-1');
    expect(result[0].isLocked).toBeUndefined();
    expect(result[0].media?.[0].url).toBe('https://cdn/video.mp4');
  });

  it('unlocks premium posts if viewer has an unlocked record', async () => {
    mockPrisma.profile.findUnique.mockResolvedValue({ userId: 'user-viewer' });
    mockPrisma.postUnlock.findMany.mockResolvedValue([{ postId: 'p1' }]);

    const posts = [
      {
        id: 'p1',
        profileId: 'author-1',
        isPremium: true,
        media: [{ id: 'm1', url: 'https://cdn/video.mp4' }],
      },
    ];
    const result = await service.applyPaywall(posts, 'viewer-1');
    expect(result[0].isLocked).toBeUndefined();
    expect(result[0].media?.[0].url).toBe('https://cdn/video.mp4');
  });

  it('locks premium posts if viewer has not unlocked the post', async () => {
    mockPrisma.profile.findUnique.mockResolvedValue({ userId: 'user-viewer' });
    mockPrisma.postUnlock.findMany.mockResolvedValue([]);

    const posts = [
      {
        id: 'p1',
        profileId: 'author-1',
        isPremium: true,
        media: [{ id: 'm1', url: 'https://cdn/locked.mp4' }],
      },
    ];
    const result = await service.applyPaywall(posts, 'viewer-1');
    expect(result[0].isLocked).toBe(true);
    expect(result[0].media?.[0].url).toBe('/media/teaser/m1/locked.mp4');
  });
});
