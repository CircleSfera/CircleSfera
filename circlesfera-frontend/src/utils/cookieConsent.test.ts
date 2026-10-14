import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCookieConsent, persistCookieConsent } from './cookieConsent';

const KEY = 'cs_cookie_consent';

describe('cookie consent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('has no answer until the person gives one', () => {
    expect(getCookieConsent()).toBeNull();
  });

  it.each([true, false])(
    'keeps the answer (analytics %s) and reads it back',
    (analytics) => {
      const kept = persistCookieConsent(analytics);

      expect(kept).toMatchObject({ necessary: true, analytics });
      expect(Number.isNaN(Date.parse(kept.updatedAt))).toBe(false);
      expect(getCookieConsent()).toEqual(kept);
    },
  );

  it.each([
    ['text that is not an answer', 'not json'],
    ['an answer without the necessary cookies', '{"analytics":true}'],
    [
      'an answer whose analytics is not yes or no',
      '{"necessary":true,"analytics":"yes"}',
    ],
    ['nothing at all', 'null'],
  ])('takes %s as no answer, so the person is asked again', (_what, stored) => {
    localStorage.setItem(KEY, stored);

    expect(getCookieConsent()).toBeNull();
  });

  it('takes storage that cannot be read as no answer', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(getCookieConsent()).toBeNull();
  });
});
