import { describe, expect, it } from 'vitest';
import {
  LIVE_GIFT_CATALOG,
  resolveGiftAmountCents,
  resolveGiftName,
} from './gift-catalog.js';

/** Must stay in sync with circlesfera-frontend live.gifts.* */
const EXPECTED_NAMES = {
  star: { en: 'Sfera Star', es: 'Estrella Sfera' },
  flame: { en: 'Flame', es: 'Fuego' },
  crown: { en: 'Royal Crown', es: 'Corona Real' },
  gem: { en: 'Diamond', es: 'Diamante' },
  rocket: { en: 'Sfera Rocket', es: 'Cohete Sfera' },
} as const;

describe('LIVE_GIFT_CATALOG', () => {
  it('resolves every catalog id to its server amountCents', () => {
    for (const [giftId, entry] of Object.entries(LIVE_GIFT_CATALOG)) {
      expect(entry.amountCents).toBeGreaterThan(0);
      expect(resolveGiftAmountCents(giftId)).toBe(entry.amountCents);
    }
  });

  it('exposes English and Spanish names aligned with the frontend catalog', () => {
    expect(Object.keys(LIVE_GIFT_CATALOG).sort()).toEqual(
      Object.keys(EXPECTED_NAMES).sort(),
    );
    for (const [giftId, names] of Object.entries(EXPECTED_NAMES)) {
      expect(LIVE_GIFT_CATALOG[giftId].names).toEqual(names);
      expect(resolveGiftName(giftId, 'en')).toBe(names.en);
      expect(resolveGiftName(giftId, 'es')).toBe(names.es);
      expect(resolveGiftName(giftId)).toBe(names.en);
    }
  });

  it('rejects ids that are not in the catalog', () => {
    expect(resolveGiftAmountCents('not-a-gift')).toBeNull();
    expect(resolveGiftAmountCents('')).toBeNull();
    expect(resolveGiftName('not-a-gift')).toBeNull();
    expect(resolveGiftName('')).toBeNull();
  });
});
