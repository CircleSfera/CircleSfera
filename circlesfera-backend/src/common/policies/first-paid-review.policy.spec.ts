import { FIRST_PAID_ITEMS_REVIEWED_BY_STAFF } from '@circlesfera/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  awaitsStaffPaidReview,
  staffPassedPaidCount,
} from './first-paid-review.policy.js';

const db = (item: object | null, posts = 0, stories = 0) =>
  ({
    post: {
      findUnique: vi.fn().mockResolvedValue(item),
      count: vi.fn().mockResolvedValue(posts),
    },
    story: {
      findUnique: vi.fn().mockResolvedValue(item),
      count: vi.fn().mockResolvedValue(stories),
    },
  }) as any;

const priced = { priceCents: 500, profileId: 'creator-1' };

describe('staffPassedPaidCount', () => {
  it('adds the priced posts and stories a person passed', async () => {
    const reader = db(null, 2, 1);
    await expect(staffPassedPaidCount(reader, 'creator-1')).resolves.toBe(3);
    const where = {
      profileId: 'creator-1',
      priceCents: { gt: 0 },
      moderationPassedByStaff: true,
    };
    expect(reader.post.count).toHaveBeenCalledWith({ where });
    expect(reader.story.count).toHaveBeenCalledWith({ where });
  });
});

describe('awaitsStaffPaidReview', () => {
  it.each(['POST', 'STORY'] as const)(
    'makes a priced %s wait while its Profile is under the threshold',
    async (type) => {
      const reader = db(priced, FIRST_PAID_ITEMS_REVIEWED_BY_STAFF - 1, 0);
      await expect(awaitsStaffPaidReview(reader, type, 'x-1')).resolves.toBe(
        true,
      );
      const model = type === 'POST' ? reader.post : reader.story;
      expect(model.findUnique).toHaveBeenCalledWith({
        where: { id: 'x-1' },
        select: { priceCents: true, profileId: true },
      });
    },
  );

  it('lets a priced item through once enough were passed by a person', async () => {
    const reader = db(priced, FIRST_PAID_ITEMS_REVIEWED_BY_STAFF, 0);
    await expect(awaitsStaffPaidReview(reader, 'POST', 'x-1')).resolves.toBe(
      false,
    );
  });

  it.each([
    ['a free item', { priceCents: 0, profileId: 'creator-1' }],
    ['an item that is gone', null],
  ])('never makes %s wait', async (_case, item) => {
    const reader = db(item);
    await expect(awaitsStaffPaidReview(reader, 'STORY', 'x-1')).resolves.toBe(
      false,
    );
    expect(reader.post.count).not.toHaveBeenCalled();
  });
});
