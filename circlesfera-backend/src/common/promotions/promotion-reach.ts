import { PROMOTION_COST_PER_VIEW_CENTS } from '../constants/promotion.constants.js';

// The people a promotion can reach in the countries it is aimed at: those
// active on CircleSfera in this many days.
export const PROMOTION_AUDIENCE_ACTIVE_DAYS = 30;

// Below this many people in the countries chosen no number is shown, so an
// estimate never says whether a few known people were active (as on Meta).
export const PROMOTION_AUDIENCE_MINIMUM = 1000;

/**
 * A number shown with two significant figures (3,487 → 3,500), so two
 * estimates cannot be subtracted to count a small group of people.
 */
export function roundForEstimate(value: number): number {
  if (value < 100) return value;
  const step = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / step) * step;
}

/**
 * How many people a promotion will reach, as a range shown before paying
 * (PD-089, as on Meta). A person is charged once a day, so a budget buys
 * that many person-days: at least one day's worth of different people, and
 * at most the whole budget if each one is someone new. Never more than the
 * people there are to reach. What is not delivered is refunded.
 *
 * Null when the countries chosen have fewer people than the minimum: then
 * no number is shown at all.
 */
export function estimatedReach(input: {
  dailyBudgetCents: number;
  durationDays: number;
  audience: number;
}): { low: number; high: number } | null {
  if (input.audience < PROMOTION_AUDIENCE_MINIMUM) return null;
  const perDay = Math.floor(
    input.dailyBudgetCents / PROMOTION_COST_PER_VIEW_CENTS,
  );
  const high = roundForEstimate(
    Math.min(input.audience, perDay * input.durationDays),
  );
  const low = Math.min(high, roundForEstimate(perDay));
  return { low, high };
}
