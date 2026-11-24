import { describe, expect, it } from 'vitest';
import { estimatedReach } from './promotion-reach.js';

describe('estimatedReach', () => {
  it('ranges from one day of different people to the whole budget in new people', () => {
    // €5 a day for 7 days: 500 people a day, 3,500 person-days in all.
    expect(
      estimatedReach({ dailyBudgetCents: 500, durationDays: 7, audience: 1e6 }),
    ).toEqual({ low: 500, high: 3500 });
  });

  it('never promises more people than there are to reach', () => {
    expect(
      estimatedReach({
        dailyBudgetCents: 5000,
        durationDays: 30,
        audience: 1200,
      }),
    ).toEqual({ low: 1200, high: 1200 });
    expect(
      estimatedReach({
        dailyBudgetCents: 500,
        durationDays: 7,
        audience: 2000,
      }),
    ).toEqual({ low: 500, high: 2000 });
  });

  it('says nobody when nobody is there', () => {
    expect(
      estimatedReach({ dailyBudgetCents: 500, durationDays: 3, audience: 0 }),
    ).toEqual({ low: 0, high: 0 });
    expect(
      estimatedReach({ dailyBudgetCents: 500, durationDays: 3, audience: -4 }),
    ).toEqual({ low: 0, high: 0 });
  });
});
