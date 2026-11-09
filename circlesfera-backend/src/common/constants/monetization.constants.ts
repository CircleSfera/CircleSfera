import type { AccountType } from '@prisma/client';

export const PLATFORM_FEE_DECIMAL = 0.2;
export const PLATFORM_FEE_PERCENT = 20.0;
export const CREATOR_SHARE_DECIMAL = 1.0 - PLATFORM_FEE_DECIMAL; // 0.8

// The platform fee of a price, and what the creator receives of it: the
// price less the fee, so the two always add up to the price and the
// creator's earnings match the amount sent to their payout account.
export function platformFeeCents(priceCents: number): number {
  return Math.floor(priceCents * PLATFORM_FEE_DECIMAL);
}

export function creatorShareCents(priceCents: number): number {
  return priceCents - platformFeeCents(priceCents);
}

// Pay-per-view range for posts, stories and messages (owner decision: €3–€500).
export const MIN_PPV_PRICE_CENTS = 300; // €3.00
export const MAX_PPV_PRICE_CENTS = 50000; // €500.00

// Smallest tip. CircleSfera absorbs the Stripe fee inside its 20%, so smaller
// amounts would lose money on every payment (owner decision: €2).
export const MIN_TIP_CENTS = 200; // €2.00

// When the provider pays a creator's balance out to their bank: on its own,
// once a week, on Monday (owner decision). Each payout and each account paid
// out in a month cost the platform a fee, so a daily schedule could cost more
// than it earns from a small creator.
export const CREATOR_PAYOUT_SCHEDULE = {
  interval: 'weekly',
  weekly_anchor: 'monday',
} as const;

// Instant payouts (owner decision): only for a Profile with a track record,
// at least 90 days since its first sale, at least 10 sales and no dispute in
// the last 180 days. Each costs the creator 1.5% of the amount, at least
// €0.50. The provider takes the fee through the platform pricing set in its
// dashboard; these numbers are what CircleSfera expects it to take.
export const INSTANT_PAYOUT_MIN_DAYS_SINCE_FIRST_SALE = 90;
export const INSTANT_PAYOUT_MIN_SALES = 10;
export const INSTANT_PAYOUT_DISPUTE_FREE_DAYS = 180;
export const INSTANT_PAYOUT_FEE_BASIS_POINTS = 150; // 1.5%
export const INSTANT_PAYOUT_MIN_FEE_CENTS = 50; // €0.50

// The fee CircleSfera expects on an instant payout of an amount: 1.5% of it,
// rounded up to the cent, and never less than €0.50.
export function instantPayoutFeeCents(amountCents: number): number {
  return Math.max(
    INSTANT_PAYOUT_MIN_FEE_CENTS,
    Math.ceil((amountCents * INSTANT_PAYOUT_FEE_BASIS_POINTS) / 10_000),
  );
}

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

// Convert integer cents to major currency units for API display.
export function centsToEuros(cents: number): number {
  return cents / 100;
}

// Only Creator/Business accounts may monetize (PPV pricing, tips, Stripe
// Connect onboarding). Single source of truth for this eligibility rule —
// previously reimplemented independently in monetization.service.ts,
// posts.service.ts and stories.service.ts.
// Explicit allowlist (fail-closed): an unresolved profile or unrecognized
// accountType must not be treated as monetization-eligible.
export function canMonetize(
  accountType: AccountType | null | undefined,
): boolean {
  return accountType === 'CREATOR' || accountType === 'BUSINESS';
}
