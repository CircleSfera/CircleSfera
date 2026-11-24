import { describe, expect, it } from 'vitest';
import {
  estimatedReach,
  PROMOTION_AUDIENCE_MINIMUM,
  roundForEstimate,
} from './promotion-reach.js';

describe('estimatedReach', () => {
  it('ranges from one day of different people to the whole budget in new people', () => {
    // €5 a day for 7 days: 500 people a day, 3,500 person-days in all.
    expect(
      estimatedReach({ dailyBudgetCents: 500, durationDays: 7, audience: 1e6 }),
    ).toEqual({ low: 500, high: 3500 });
  });

  it('never promises more people than there are, and says how many only roughly', () => {
    expect(
      estimatedReach({
        dailyBudgetCents: 5000,
        durationDays: 30,
        audience: 1234,
      }),
    ).toEqual({ low: 1200, high: 1200 });
    expect(
      estimatedReach({
        dailyBudgetCents: 500,
        durationDays: 7,
        audience: 2049,
      }),
    ).toEqual({ low: 500, high: 2000 });
  });

  it('gives no number at all below the minimum, so a few known people stay unknown', () => {
    for (const audience of [0, 1, 2, PROMOTION_AUDIENCE_MINIMUM - 1]) {
      expect(
        estimatedReach({ dailyBudgetCents: 500, durationDays: 3, audience }),
      ).toBeNull();
    }
    expect(
      estimatedReach({
        dailyBudgetCents: 500,
        durationDays: 3,
        audience: PROMOTION_AUDIENCE_MINIMUM,
      }),
    ).toEqual({ low: 500, high: 1000 });
  });
});

describe('roundForEstimate', () => {
  it('keeps two significant figures', () => {
    expect(roundForEstimate(42)).toBe(42);
    expect(roundForEstimate(3487)).toBe(3500);
    expect(roundForEstimate(150_000)).toBe(150_000);
    expect(roundForEstimate(152_345)).toBe(150_000);
  });
});
