import { PROMOTION_COST_PER_VIEW_CENTS } from '../constants/promotion.constants.js';

// The people a promotion can reach in the countries it is aimed at: those
// active on CircleSfera in this many days.
export const PROMOTION_AUDIENCE_ACTIVE_DAYS = 30;

/**
 * How many people a promotion will reach, as a range shown before paying
 * (PD-089, as on Meta). A person is charged once a day, so a budget buys
 * that many person-days: at least one day's worth of different people, and
 * at most the whole budget if each one is someone new. Never more than the
 * people there are to reach. What is not delivered is refunded.
 */
export function estimatedReach(input: {
  dailyBudgetCents: number;
  durationDays: number;
  audience: number;
}): { low: number; high: number } {
  const perDay = Math.floor(
    input.dailyBudgetCents / PROMOTION_COST_PER_VIEW_CENTS,
  );
  const audience = Math.max(0, input.audience);
  const high = Math.min(audience, perDay * input.durationDays);
  const low = Math.min(high, perDay);
  return { low, high };
}
