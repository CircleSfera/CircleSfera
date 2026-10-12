import { describe, expect, it, vi } from 'vitest';
import { GetContentQuery } from './get-content.query.js';

describe('GetContentQuery: finding a story', () => {
  const build = () => {
    const prisma = {
      story: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    return {
      prisma,
      query: new GetContentQuery(prisma as never, {} as never),
    };
  };
  const whereOf = (prisma: ReturnType<typeof build>['prisma']) =>
    prisma.story.findMany.mock.calls[0][0].where;

  it('finds a story by who published it, by handle or name, or by its place', async () => {
    const { query, prisma } = build();

    await query.getStories(1, 10, { search: '  ana ' });

    const contains = { contains: 'ana', mode: 'insensitive' };
    expect(whereOf(prisma)).toEqual({
      OR: [
        { profile: { username: contains } },
        { profile: { fullName: contains } },
        { location: contains },
      ],
    });
    expect(prisma.story.count).toHaveBeenCalledWith({
      where: whereOf(prisma),
    });
  });

  it('combines the search with the account and the moderation state', async () => {
    const { query, prisma } = build();

    await query.getStories(1, 10, {
      search: 'ana',
      userId: 'user-1',
      moderationStatus: 'FLAGGED',
    });

    expect(whereOf(prisma)).toMatchObject({
      profile: { userId: 'user-1' },
      moderationStatus: 'FLAGGED',
    });
    expect(whereOf(prisma).OR).toHaveLength(3);
  });

  it('asks for every story when the search is empty or only spaces', async () => {
    const { query, prisma } = build();

    await query.getStories(1, 10, { search: '   ' });

    expect(whereOf(prisma)).toEqual({});
  });
});
