import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PostTagsService } from './post-tags.service.js';

describe('PostTagsService', () => {
  const prisma = {
    block: { findMany: vi.fn() },
    profile: { findUnique: vi.fn() },
    userSettings: { findUnique: vi.fn() },
    follow: { findMany: vi.fn() },
    postTag: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  let service: PostTagsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.block.findMany.mockResolvedValue([]);
    prisma.profile.findUnique.mockResolvedValue({ userId: 'u-me' });
    prisma.userSettings.findUnique.mockResolvedValue({
      contentPreference: 'GENERAL',
    });
    prisma.follow.findMany.mockResolvedValue([]);
    service = new PostTagsService(prisma as unknown as PrismaService);
  });

  const row = (id: string, over: Record<string, unknown> = {}) => ({
    createdAt: new Date('2026-11-01T00:00:00Z'),
    status: 'SHOWN',
    post: {
      id,
      profileId: `author-${id}`,
      caption: `caption ${id}`,
      contentRating: 'GENERAL',
      visibility: 'PUBLIC',
      moderationStatus: 'VISIBLE',
      createdAt: new Date('2026-11-01T00:00:00Z'),
      profile: { username: `author_${id}`, privacyLevel: 'PUBLIC' },
      media: [
        { thumbnailUrl: null, url: `https://cdn/${id}.jpg`, type: 'image' },
      ],
      ...over,
    },
  });
  const settings = (contentPreference: string, blurSensitiveContent = true) =>
    prisma.userSettings.findUnique.mockResolvedValue({
      contentPreference,
      blurSensitiveContent,
    });

  it('lists the tags of the Profile on posts still up, leaving out authors across a block', async () => {
    prisma.block.findMany.mockResolvedValue([
      { blockerId: 'me', blockedId: 'bad' },
    ]);
    prisma.postTag.findMany.mockResolvedValue([]);

    await service.list('me', 'PENDING');

    expect(prisma.postTag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          profileId: 'me',
          status: 'PENDING',
          post: {
            moderationStatus: { not: 'REMOVED' },
            deletedAt: null,
            archivedAt: null,
            profileId: { notIn: ['bad'] },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('shows the details of a post only when the Profile may open it, and keeps the rest removable', async () => {
    prisma.postTag.findMany.mockResolvedValue([
      row('public'),
      row('for-fans', { visibility: 'FOLLOWERS' }),
      row('fan-private', {
        profile: { username: 'x', privacyLevel: 'PRIVATE' },
      }),
      row('closed', { profile: { username: 'y', privacyLevel: 'PRIVATE' } }),
      row('stranger-fans', { visibility: 'FOLLOWERS' }),
      row('reviewed', { moderationStatus: 'HIDDEN' }),
    ]);
    prisma.follow.findMany.mockResolvedValue([
      { followingId: 'author-for-fans' },
      { followingId: 'author-fan-private' },
    ]);

    const { data } = await service.list('me', 'SHOWN');

    expect(prisma.follow.findMany).toHaveBeenCalledWith({
      where: {
        followerId: 'me',
        followingId: {
          in: [
            'author-public',
            'author-for-fans',
            'author-fan-private',
            'author-closed',
            'author-stranger-fans',
            'author-reviewed',
          ],
        },
        status: 'ACCEPTED',
      },
      select: { followingId: true },
    });
    expect(data.map((t) => [t.post.id, t.canOpen])).toEqual([
      ['public', true],
      ['for-fans', true],
      ['fan-private', true],
      ['closed', false],
      ['stranger-fans', false],
      ['reviewed', false],
    ]);
    // Of a post it cannot open, nothing but what removing the tag needs.
    expect(data[3].post).toEqual({
      id: 'closed',
      caption: null,
      createdAt: expect.any(Date),
      thumbnailUrl: null,
      profile: null,
    });
    expect(data[0].post).toEqual({
      id: 'public',
      caption: 'caption public',
      createdAt: expect.any(Date),
      thumbnailUrl: 'https://cdn/public.jpg',
      profile: { username: 'author_public', privacyLevel: 'PUBLIC' },
    });
  });

  it("follows the Profile's content preferences on a mature post", async () => {
    prisma.postTag.findMany.mockResolvedValue([
      row('m', { contentRating: 'MATURE' }),
    ]);

    // Mature not allowed: no picture and no caption, still listed.
    settings('GENERAL');
    let { data } = await service.list('me', 'SHOWN');
    expect(data[0]).toMatchObject({
      canOpen: true,
      post: { id: 'm', caption: null, thumbnailUrl: null },
    });

    // Allowed but blurred: the caption, no picture.
    settings('MATURE', true);
    ({ data } = await service.list('me', 'SHOWN'));
    expect(data[0].post).toMatchObject({
      caption: 'caption m',
      thumbnailUrl: null,
    });

    // Allowed and not blurred: both.
    settings('MATURE', false);
    ({ data } = await service.list('me', 'SHOWN'));
    expect(data[0].post).toMatchObject({
      caption: 'caption m',
      thumbnailUrl: 'https://cdn/m.jpg',
    });
  });

  it('approves only a tag of its own that is waiting', async () => {
    prisma.postTag.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(service.approve('post-1', 'me')).resolves.toEqual({
      postId: 'post-1',
      status: 'SHOWN',
    });
    expect(prisma.postTag.updateMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', profileId: 'me', status: 'PENDING' },
      data: { status: 'SHOWN' },
    });

    prisma.postTag.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.approve('post-2', 'me')).rejects.toMatchObject({
      response: { errorCode: 'NOT_FOUND' },
    });
  });

  it('takes the Profile off a post, and answers NotFound for a tag it does not have', async () => {
    prisma.postTag.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(service.remove('post-1', 'me')).resolves.toEqual({
      postId: 'post-1',
      removed: true,
    });
    expect(prisma.postTag.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', profileId: 'me' },
    });

    prisma.postTag.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.remove('post-2', 'me')).rejects.toMatchObject({
      response: { errorCode: 'NOT_FOUND' },
    });
  });
});
