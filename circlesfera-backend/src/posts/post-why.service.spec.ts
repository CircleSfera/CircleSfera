import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertCanAccessPost } from '../common/policies/post-access.policy.js';
import { PostWhyService } from './post-why.service.js';

vi.mock('../common/policies/post-access.policy.js', () => ({
  assertCanAccessPost: vi.fn(),
}));

const OLD = new Date(Date.now() - 10 * 86_400_000);

describe('PostWhyService', () => {
  const prisma = {
    post: { findUnique: vi.fn() },
    follow: { findUnique: vi.fn() },
    like: { count: vi.fn(), findMany: vi.fn() },
    bookmark: { findMany: vi.fn() },
    comment: { count: vi.fn() },
    postHashtag: { findMany: vi.fn() },
    promotion: { findFirst: vi.fn() },
    profile: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const service = new PostWhyService(prisma as never);
  const post = (over: Record<string, unknown> = {}) => ({
    id: 'post-1',
    profileId: 'author',
    visibility: 'PUBLIC',
    createdAt: OLD,
    performanceScore: 0,
    profile: { username: 'ana' },
    hashtags: [],
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertCanAccessPost).mockResolvedValue({} as never);
    prisma.post.findUnique.mockResolvedValue(post());
    prisma.follow.findUnique.mockResolvedValue(null);
    prisma.bookmark.findMany.mockResolvedValue([]);
    prisma.like.count.mockResolvedValue(0);
    prisma.like.findMany.mockResolvedValue([]);
    prisma.comment.count.mockResolvedValue(0);
    prisma.postHashtag.findMany.mockResolvedValue([]);
    prisma.promotion.findFirst.mockResolvedValue(null);
    prisma.profile.findUnique.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([]);
  });

  const codes = async (viewer?: string | null) =>
    (await service.why('post-1', viewer)).reasons.map((r) => r.code);

  it.each([
    [new NotFoundException()],
    [new ForbiddenException('This account is private')],
  ])('answers not found for a post the viewer cannot see (%s)', async (err) => {
    vi.mocked(assertCanAccessPost).mockRejectedValue(err);

    await expect(service.why('post-1', 'viewer')).rejects.toMatchObject({
      errorCode: 'POST_NOT_FOUND',
    });
    expect(prisma.post.findUnique).not.toHaveBeenCalled();
  });

  it('passes on any other failure of the access check', async () => {
    vi.mocked(assertCanAccessPost).mockRejectedValue(new Error('db down'));

    await expect(service.why('post-1', 'viewer')).rejects.toThrow('db down');
  });

  it('answers not found when the post is gone after the check', async () => {
    prisma.post.findUnique.mockResolvedValue(null);

    await expect(service.why('post-1', 'viewer')).rejects.toMatchObject({
      errorCode: 'POST_NOT_FOUND',
    });
  });

  it("says it is the viewer's own post", async () => {
    expect(await codes('author')).toEqual(['own']);
    expect(prisma.follow.findUnique).not.toHaveBeenCalled();
  });

  it('names the author the viewer follows', async () => {
    prisma.follow.findUnique.mockResolvedValue({ status: 'ACCEPTED' });

    const { reasons } = await service.why('post-1', 'viewer');

    expect(reasons).toContainEqual({ code: 'following', username: 'ana' });
    // Following already explains it: past likes of the author are not read.
    expect(prisma.like.count).not.toHaveBeenCalled();
  });

  it('does not count a follow request still waiting', async () => {
    prisma.follow.findUnique.mockResolvedValue({ status: 'PENDING' });

    expect(await codes('viewer')).not.toContain('following');
  });

  it('says the viewer engaged with an author they do not follow', async () => {
    prisma.comment.count.mockResolvedValue(2);

    const { reasons } = await service.why('post-1', 'viewer');

    expect(reasons).toContainEqual({
      code: 'engaged_with_author',
      username: 'ana',
    });
    expect(prisma.like.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        profileId: 'viewer',
        post: { profileId: 'author', id: { not: 'post-1' } },
      }),
    });
  });

  it('names up to three tags shared with posts the viewer liked or saved, starting from their own recent activity', async () => {
    prisma.post.findUnique.mockResolvedValue(
      post({ hashtags: [{ hashtag: { id: 'h1', tag: 'cats' } }] }),
    );
    prisma.like.findMany.mockImplementation(async (args: { take: number }) =>
      args.take === 200 ? [{ postId: 'liked-1' }] : [],
    );
    prisma.bookmark.findMany.mockResolvedValue([
      { postId: 'saved-1' },
      { postId: 'liked-1' },
    ]);
    prisma.postHashtag.findMany.mockResolvedValue([
      { hashtag: { tag: 'cats' } },
    ]);

    const { reasons } = await service.why('post-1', 'viewer');

    expect(reasons).toContainEqual({
      code: 'liked_similar_tags',
      tags: ['cats'],
    });
    // The viewer's own recent likes and saves, bounded, never this post.
    expect(prisma.bookmark.findMany).toHaveBeenCalledWith({
      where: {
        profileId: 'viewer',
        createdAt: { gte: expect.any(Date) },
        postId: { not: 'post-1' },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { postId: true },
    });
    // Then only their tags, on those posts.
    expect(prisma.postHashtag.findMany).toHaveBeenCalledWith({
      where: {
        postId: { in: ['liked-1', 'saved-1'] },
        hashtagId: { in: ['h1'] },
      },
      distinct: ['hashtagId'],
      select: { hashtag: { select: { tag: true } } },
      take: 3,
    });
  });

  it('reads no tags when the viewer liked and saved nothing lately', async () => {
    prisma.post.findUnique.mockResolvedValue(
      post({ hashtags: [{ hashtag: { id: 'h1', tag: 'cats' } }] }),
    );

    expect(await codes('viewer')).not.toContain('liked_similar_tags');
    expect(prisma.postHashtag.findMany).not.toHaveBeenCalled();
  });

  it("says the post matches what the viewer liked, at the feed's threshold", async () => {
    prisma.like.findMany.mockResolvedValue([{ postId: 'liked-1' }]);
    prisma.$queryRaw.mockResolvedValueOnce([{ score: 0.8 }]);
    expect(await codes('viewer')).toContain('similar_content');

    prisma.$queryRaw.mockResolvedValueOnce([{ score: 0.5 }]);
    expect(await codes('viewer')).not.toContain('similar_content');

    prisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await codes('viewer')).not.toContain('similar_content');
  });

  it('reads no taste without likes', async () => {
    expect(await codes('viewer')).not.toContain('similar_content');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('says popular and new from the post itself, also to a visitor', async () => {
    prisma.post.findUnique.mockResolvedValue(
      post({ performanceScore: 21, createdAt: new Date() }),
    );

    expect(await codes(null)).toEqual(['popular', 'new']);
    expect(prisma.follow.findUnique).not.toHaveBeenCalled();
  });

  it('explains a promotion that reaches the viewer, with who paid and where', async () => {
    prisma.promotion.findFirst.mockResolvedValue({ countries: 'ES,PT' });
    prisma.profile.findUnique.mockResolvedValue({
      user: { signupCountry: 'ES', settings: null },
    });

    const { reasons } = await service.why('post-1', 'viewer');

    expect(reasons).toContainEqual({
      code: 'promoted',
      username: 'ana',
      countries: ['ES', 'PT'],
    });
  });

  it('leaves out a promotion aimed elsewhere, and says it to anyone when aimed everywhere', async () => {
    prisma.promotion.findFirst.mockResolvedValue({ countries: 'FR' });
    prisma.profile.findUnique.mockResolvedValue({
      user: { signupCountry: 'ES', settings: null },
    });
    expect(await codes('viewer')).not.toContain('promoted');

    prisma.promotion.findFirst.mockResolvedValue({ countries: null });
    const { reasons } = await service.why('post-1', null);
    expect(reasons).toContainEqual({
      code: 'promoted',
      username: 'ana',
      countries: [],
    });
  });
});
