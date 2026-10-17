import { describe, expect, it } from 'vitest';
import { dailyBudgetReached, spentOn, utcDay } from './promotion-pacing.js';

describe('promotion pacing', () => {
  it('names the day in universal time', () => {
    expect(utcDay(new Date('2026-10-17T23:30:00-02:00'))).toBe('2026-10-18');
  });

  it('counts what was spent on the same day only', () => {
    const promo = {
      dailyBudgetCents: 500,
      spendDay: new Date('2026-10-17T00:00:00Z'),
      spentTodayCents: 120,
    };
    expect(spentOn(promo, '2026-10-17')).toBe(120);
    expect(spentOn(promo, '2026-10-18')).toBe(0);
    expect(spentOn({ ...promo, spendDay: '2026-10-17' }, '2026-10-17')).toBe(
      120,
    );
    expect(spentOn({ ...promo, spendDay: null }, '2026-10-17')).toBe(0);
  });

  it('stops a day at its budget, and starts the next one again', () => {
    const atCap = {
      dailyBudgetCents: 500,
      spendDay: '2026-10-17',
      spentTodayCents: 500,
    };
    expect(dailyBudgetReached(atCap, '2026-10-17')).toBe(true);
    expect(dailyBudgetReached(atCap, '2026-10-18')).toBe(false);
    expect(
      dailyBudgetReached({ ...atCap, spentTodayCents: 499 }, '2026-10-17'),
    ).toBe(false);
    expect(
      dailyBudgetReached({ ...atCap, dailyBudgetCents: null }, '2026-10-17'),
    ).toBe(false);
  });
});
