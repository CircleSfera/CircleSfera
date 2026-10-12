import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetContentQuery } from './get-content.query.js';

// The staff list of hashtags: what it asks the database for.
describe('GetContentQuery: hashtags', () => {
  const prisma = {
    hashtag: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  const query = new GetContentQuery(prisma as never, {} as never);
  const where = () => prisma.hashtag.findMany.mock.calls[0][0].where;

  beforeEach(() => vi.clearAllMocks());

  it('lists every hashtag, hidden or not, the most used first', async () => {
    await query.getHashtags();

    expect(where()).toEqual({});
    expect(prisma.hashtag.findMany.mock.calls[0][0].orderBy).toEqual({
      postCount: 'desc',
    });
  });

  it('narrows to the hidden ones, alone or with a search', async () => {
    await query.getHashtags(1, 20, undefined, true);
    expect(where()).toEqual({ isHidden: true });

    prisma.hashtag.findMany.mockClear();
    await query.getHashtags(2, 5, 'spa', true);
    expect(where()).toEqual({
      tag: { contains: 'spa', mode: 'insensitive' },
      isHidden: true,
    });
    // The count is of the same list.
    expect(prisma.hashtag.count).toHaveBeenLastCalledWith({ where: where() });
  });
});
