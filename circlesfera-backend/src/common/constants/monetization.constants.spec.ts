import {
  centsToEuros,
  eurosToCents,
  PROMOTION_COST_PER_VIEW_CENTS,
} from './monetization.constants.js';

describe('monetization money helpers', () => {
  it('rounds half-up style via Math.round for eurosToCents', () => {
    expect(eurosToCents(9.99)).toBe(999);
    expect(eurosToCents(19.99)).toBe(1999);
    expect(eurosToCents(0.01)).toBe(1);
    expect(eurosToCents(0.005)).toBe(1);
    expect(eurosToCents(0.004)).toBe(0);
    expect(eurosToCents(-5)).toBe(0);
  });

  it('converts cents back to euros without float drift for common prices', () => {
    expect(centsToEuros(999)).toBe(9.99);
    expect(centsToEuros(1)).toBe(0.01);
    expect(centsToEuros(0)).toBe(0);
  });

  it('uses 1 cent per sponsored view', () => {
    expect(PROMOTION_COST_PER_VIEW_CENTS).toBe(1);
    expect(eurosToCents(0.01)).toBe(PROMOTION_COST_PER_VIEW_CENTS);
  });
});
