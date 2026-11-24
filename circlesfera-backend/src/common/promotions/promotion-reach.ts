import { PROMOTION_COST_PER_VIEW_CENTS } from '../constants/promotion.constants.js';

// The people a promotion can reach in the countries it is aimed at: those
// active on CircleSfera in this many days.
export const PROMOTION_AUDIENCE_ACTIVE_DAYS = 30;

// A country with fewer people than this gives no number, so a choice never
// says whether a few known people were active there.
export const PROMOTION_AUDIENCE_MINIMUM = 1000;

/**
 * The most times a promotion can be shown with its budget: a person is
 * charged once a day, one cent each (PD-089). An exact figure, not an
 * estimate; what is not delivered is refunded.
 */
export function promotionMaxShows(
  dailyBudgetCents: number,
  durationDays: number,
): number {
  return (
    Math.floor(dailyBudgetCents / PROMOTION_COST_PER_VIEW_CENTS) * durationDays
  );
}
