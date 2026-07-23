/**
 * Canonical live gift catalog. Client-supplied prices are ignored;
 * amountCents is always resolved server-side from giftId.
 */
export const LIVE_GIFT_CATALOG: Record<
  string,
  { name: string; amountCents: number }
> = {
  star: { name: 'Estrella Sfera', amountCents: 100 },
  flame: { name: 'Fuego', amountCents: 500 },
  crown: { name: 'Corona Real', amountCents: 1000 },
  gem: { name: 'Diamante', amountCents: 2500 },
  rocket: { name: 'Cohete Sfera', amountCents: 5000 },
};

export function resolveGiftAmountCents(giftId: string): number | null {
  const entry = LIVE_GIFT_CATALOG[giftId];
  return entry ? entry.amountCents : null;
}
