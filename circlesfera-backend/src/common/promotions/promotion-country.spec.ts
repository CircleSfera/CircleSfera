import { describe, expect, it } from 'vitest';
import { promotionReaches, viewerCountryOf } from './promotion-country.js';

describe('promotion country', () => {
  it('takes the country chosen in settings before the one of the network', () => {
    expect(
      viewerCountryOf({ signupCountry: 'FR', settings: { country: 'ES' } }),
    ).toBe('ES');
    expect(
      viewerCountryOf({ signupCountry: 'FR', settings: { country: null } }),
    ).toBe('FR');
    expect(viewerCountryOf({ signupCountry: null, settings: null })).toBeNull();
    expect(viewerCountryOf(undefined)).toBeNull();
  });

  it('reaches everywhere when no country is named', () => {
    expect(promotionReaches(null, null)).toBe(true);
    expect(promotionReaches('', 'ES')).toBe(true);
  });

  it('reaches only viewers in one of the countries named', () => {
    expect(promotionReaches('ES,FR', 'FR')).toBe(true);
    expect(promotionReaches('ES,FR', 'DE')).toBe(false);
  });

  it('does not reach a viewer whose country is not known', () => {
    expect(promotionReaches('ES', null)).toBe(false);
  });
});
