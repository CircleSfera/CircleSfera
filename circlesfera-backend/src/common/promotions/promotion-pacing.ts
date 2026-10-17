import { PROMOTION_COST_PER_VIEW_CENTS } from '../constants/monetization.constants.js';

// The day a view belongs to, in universal time, as YYYY-MM-DD.
export function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

interface Spend {
  dailyBudgetCents: number | null;
  spendDay: Date | string | null;
  spentTodayCents: number;
}

// What a promotion has spent on the given day: a new day starts at zero.
export function spentOn(promo: Spend, day: string): number {
  if (!promo.spendDay) return 0;
  const spendDay =
    typeof promo.spendDay === 'string'
      ? promo.spendDay.slice(0, 10)
      : utcDay(promo.spendDay);
  return spendDay === day ? promo.spentTodayCents : 0;
}

// Whether one more view would spend more than the budget per day.
export function dailyBudgetReached(promo: Spend, day: string): boolean {
  if (promo.dailyBudgetCents == null) return false;
  return (
    spentOn(promo, day) + PROMOTION_COST_PER_VIEW_CENTS > promo.dailyBudgetCents
  );
}
