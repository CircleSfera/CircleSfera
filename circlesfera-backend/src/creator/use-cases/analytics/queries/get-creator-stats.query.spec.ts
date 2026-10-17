import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetCreatorStatsQuery } from './get-creator-stats.query.js';

function prismaWith(likes: Date[], events: Date[] = []) {
  return {
    profile: { findUnique: vi.fn().mockResolvedValue({ userId: 'u-1' }) },
    post: {
      count: vi.fn().mockResolvedValue(1),
      aggregate: vi.fn().mockResolvedValue({ _sum: { views: 0 } }),
    },
    story: { count: vi.fn().mockResolvedValue(0) },
    follow: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockResolvedValue([
        { follower: { location: 'Madrid', userId: 'fan-1' } },
        { follower: { location: null, userId: 'fan-2' } },
        // Two Profiles of one person count once.
        { follower: { location: 'Madrid', userId: 'fan-1' } },
      ]),
    },
    like: {
      count: vi.fn().mockResolvedValue(likes.length),
      findMany: vi
        .fn()
        .mockResolvedValue(likes.map((createdAt) => ({ createdAt }))),
    },
    comment: { count: vi.fn().mockResolvedValue(0) },
    bookmark: { count: vi.fn().mockResolvedValue(0) },
    promotion: { count: vi.fn().mockResolvedValue(0) },
    storyView: { count: vi.fn().mockResolvedValue(0) },
    interactionEvent: {
      findMany: vi
        .fn()
        .mockResolvedValue(events.map((createdAt) => ({ createdAt }))),
    },
  };
}

describe('GetCreatorStatsQuery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('names the best day with a code and the best hour in universal time', async () => {
    // Two likes on a Wednesday at 21:00 UTC, one on a Monday.
    const prisma = prismaWith([
      new Date('2026-10-14T21:10:00Z'),
      new Date('2026-10-14T21:40:00Z'),
      new Date('2026-10-12T08:00:00Z'),
    ]);
    const stats = await new GetCreatorStatsQuery(prisma as never).execute(
      'p-1',
    );

    expect(stats.insights.bestDayToPost).toBe('WEDNESDAY');
    expect(stats.insights.bestHourToPost).toBe(21);
  });

  it('names no best day when the week had no likes', async () => {
    const stats = await new GetCreatorStatsQuery(
      prismaWith([]) as never,
    ).execute('p-1');

    expect(stats.insights.bestDayToPost).toBeNull();
  });

  it('counts the active hours of the followers by the person behind each', async () => {
    const prisma = prismaWith(
      [],
      [new Date('2026-10-14T19:00:00Z'), new Date('2026-10-15T19:30:00Z')],
    );
    const stats = await new GetCreatorStatsQuery(prisma as never).execute(
      'p-1',
    );

    expect(prisma.interactionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: ['fan-1', 'fan-2'] },
        }),
      }),
    );
    expect(stats.activityHours[19]).toEqual({ hour: 19, count: 2 });
  });

  it('answers no figures about subscriptions, which the product does not have', async () => {
    const stats = await new GetCreatorStatsQuery(
      prismaWith([]) as never,
    ).execute('p-1');

    expect(stats).not.toHaveProperty('mrr');
    expect(stats).not.toHaveProperty('subscriberCount');
    expect(stats).not.toHaveProperty('retentionStatus');
  });
});
