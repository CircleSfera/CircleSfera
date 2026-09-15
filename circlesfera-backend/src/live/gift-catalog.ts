// Canonical live gift catalog. Client-supplied prices are ignored;
// amountCents is always resolved server-side from giftId.
// Display names mirror circlesfera-frontend live.gifts.* (en/es).
// Stripe Checkout line items use English (canonical ledger / receipt language).

export type GiftCatalogLocale = 'en' | 'es';

export type LiveGiftCatalogEntry = {
  names: Record<GiftCatalogLocale, string>;
  amountCents: number;
};

export const LIVE_GIFT_CATALOG: Record<string, LiveGiftCatalogEntry> = {
  star: {
    names: { en: 'Sfera Star', es: 'Estrella Sfera' },
    amountCents: 100,
  },
  flame: {
    names: { en: 'Flame', es: 'Fuego' },
    amountCents: 500,
  },
  crown: {
    names: { en: 'Royal Crown', es: 'Corona Real' },
    amountCents: 1000,
  },
  gem: {
    names: { en: 'Diamond', es: 'Diamante' },
    amountCents: 2500,
  },
  rocket: {
    names: { en: 'Sfera Rocket', es: 'Cohete Sfera' },
    amountCents: 5000,
  },
};

export function resolveGiftAmountCents(giftId: string): number | null {
  const entry = LIVE_GIFT_CATALOG[giftId];
  return entry ? entry.amountCents : null;
}

/** Stripe/ledger name defaults to English. Pass `es` for Spanish display copy. */
export function resolveGiftName(
  giftId: string,
  locale: GiftCatalogLocale = 'en',
): string | null {
  const entry = LIVE_GIFT_CATALOG[giftId];
  return entry ? entry.names[locale] : null;
}
