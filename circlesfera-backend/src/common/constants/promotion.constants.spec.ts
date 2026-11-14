import { describe, expect, it } from 'vitest';
import {
  eurosToCents,
  PROMOTION_COST_PER_VIEW_CENTS,
} from './promotion.constants.js';

describe('promotion money helpers', () => {
  it('rounds half-up style via Math.round for eurosToCents', () => {
    expect(eurosToCents(9.99)).toBe(999);
    expect(eurosToCents(19.99)).toBe(1999);
    expect(eurosToCents(0.01)).toBe(1);
    expect(eurosToCents(0.005)).toBe(1);
    expect(eurosToCents(0.004)).toBe(0);
    expect(eurosToCents(-5)).toBe(0);
  });

  it('uses 1 cent per sponsored view', () => {
    expect(PROMOTION_COST_PER_VIEW_CENTS).toBe(1);
    expect(eurosToCents(0.01)).toBe(PROMOTION_COST_PER_VIEW_CENTS);
  });
});
