export const PLATFORM_FEE_DECIMAL = 0.2;
export const PLATFORM_FEE_PERCENT = 20.0;
export const CREATOR_SHARE_DECIMAL = 1.0 - PLATFORM_FEE_DECIMAL; // 0.8

export const MIN_PPV_PRICE_CENTS = 100; // €1.00
export const MAX_PPV_PRICE_CENTS = 50000; // €500.00

/** Cost charged against a promotion budget per sponsored view (1 cent). */
export const PROMOTION_COST_PER_VIEW_CENTS = 1;

/** Convert major currency units (e.g. EUR) to integer cents. */
export function eurosToCents(euros: number): number {
  return Math.max(0, Math.round(euros * 100));
}

/** Convert integer cents to major currency units for API display. */
export function centsToEuros(cents: number): number {
  return cents / 100;
}
