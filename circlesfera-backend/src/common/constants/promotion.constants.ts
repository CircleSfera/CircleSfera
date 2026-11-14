// Cost charged against a promotion budget per sponsored view (1 cent).
export const PROMOTION_COST_PER_VIEW_CENTS = 1;

// What a promotion may cost and last: a budget per day, in euros, for a
// number of days, from these fixed choices. The whole budget is the one times
// the other, paid in advance; no day spends more than its budget per day.
export const PROMOTION_DAILY_BUDGETS_EUROS = [5, 10, 25, 50] as const;
export const PROMOTION_DURATIONS_DAYS = [3, 7, 14, 30] as const;

// One person sees the same promotion at most this many times a day, and
// counts, and costs, once a day.
export const PROMOTION_VIEWS_PER_PERSON_PER_DAY = 3;

// Convert major currency units (e.g. EUR) to integer cents.
export function eurosToCents(euros: number): number {
  return Math.max(0, Math.round(euros * 100));
}
