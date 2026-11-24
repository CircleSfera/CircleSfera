import { describe, expect, it, vi } from 'vitest';
import { ENTITLED_STATUSES } from '../common/constants/plan-features.constants.js';
import { profilePlanFeatures } from './plan-features.js';

describe('profilePlanFeatures', () => {
  it('gives the features of the plans and add-ons of this Profile that still give them', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        { plan: { features: ['verified_badge', 'priority_support'] } },
        { plan: { features: ['studio_pro', 'verified_badge'] } },
        { plan: null },
      ]);

    const features = await profilePlanFeatures(
      { platformSubscription: { findMany } } as never,
      'p-1',
    );

    expect([...features].sort()).toEqual([
      'priority_support',
      'studio_pro',
      'verified_badge',
    ]);
    // Only this Profile's plans, in the statuses that still give them.
    expect(findMany).toHaveBeenCalledWith({
      where: { profileId: 'p-1', status: { in: [...ENTITLED_STATUSES] } },
      select: { plan: { select: { features: true } } },
    });
  });

  it('gives nothing to a session without a Profile, without asking', async () => {
    const findMany = vi.fn();

    for (const profileId of [null, undefined, '']) {
      const features = await profilePlanFeatures(
        { platformSubscription: { findMany } } as never,
        profileId,
      );
      expect(features.size).toBe(0);
    }
    expect(findMany).not.toHaveBeenCalled();
  });
});
