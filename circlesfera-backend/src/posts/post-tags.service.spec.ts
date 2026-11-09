import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PostTagsService } from './post-tags.service.js';

describe('PostTagsService', () => {
  const prisma = {
    block: { findMany: vi.fn() },
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
    service = new PostTagsService(prisma as unknown as PrismaService);
  });

  it('lists the waiting tags of the Profile, leaving out authors across a block', async () => {
    prisma.block.findMany.mockResolvedValue([
      { blockerId: 'me', blockedId: 'bad' },
    ]);
    prisma.postTag.findMany.mockResolvedValue([]);

    await service.list('me', 'PENDING');

    expect(prisma.postTag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          profileId: 'me',
          status: 'PENDING',
          post: expect.objectContaining({ profileId: { notIn: ['bad'] } }),
        }),
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('shows a picture of the post, never of a paid one', async () => {
    const createdAt = new Date('2026-11-01T00:00:00Z');
    prisma.postTag.findMany.mockResolvedValue([
      {
        createdAt,
        status: 'SHOWN',
        post: {
          id: 'p-free',
          caption: 'hi',
          isPremium: false,
          createdAt,
          profile: { username: 'ana' },
          media: [
            { thumbnailUrl: null, url: 'https://cdn/a.jpg', type: 'image' },
          ],
        },
      },
      {
        createdAt,
        status: 'SHOWN',
        post: {
          id: 'p-paid',
          caption: 'paid',
          isPremium: true,
          createdAt,
          profile: { username: 'bea' },
          media: [
            { thumbnailUrl: 'https://cdn/t.jpg', url: 'x', type: 'image' },
          ],
        },
      },
    ]);

    const { data } = await service.list('me', 'SHOWN');

    expect(data.map((t) => t.post.thumbnailUrl)).toEqual([
      'https://cdn/a.jpg',
      null,
    ]);
    expect(data[1].post).not.toHaveProperty('media');
    expect(data[1].post).not.toHaveProperty('isPremium');
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
