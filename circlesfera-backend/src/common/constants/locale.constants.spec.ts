import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, toSupportedLocale } from './locale.constants.js';

describe('toSupportedLocale', () => {
  it.each([
    ['en', 'en'],
    ['en-GB', 'en'],
    ['ES', 'es'],
    ['es_419', 'es'],
    [' es-ES ', 'es'],
  ])('%s → %s', (tag, locale) => {
    expect(toSupportedLocale(tag)).toBe(locale);
  });

  it.each(['fr', '', undefined, null])(
    'an unsupported or missing tag (%s) falls back to the default',
    (tag) => {
      expect(toSupportedLocale(tag)).toBe(DEFAULT_LOCALE);
    },
  );
});
