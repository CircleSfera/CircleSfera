import { describe, expect, it } from 'vitest';
import { hasElitePlan } from './plans';

describe('hasElitePlan', () => {
  it.each(['ELITE', 'BUSINESS'])('is true for %s', (level) => {
    expect(hasElitePlan(level)).toBe(true);
  });

  it.each(['BASIC', 'VERIFIED', null, undefined])(
    'is false for %s',
    (level) => {
      expect(hasElitePlan(level)).toBe(false);
    },
  );
});
