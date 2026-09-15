import {
  CREATOR_SHARE_DECIMAL,
  centsToEuros,
  eurosToCents,
  PLATFORM_FEE_DECIMAL,
  PLATFORM_FEE_PERCENT,
  PROMOTION_COST_PER_VIEW_CENTS,
} from './monetization.constants.js';

describe('monetization money helpers', () => {
  it('keeps the 20% platform / 80% creator split (ADR-0010)', () => {
    expect(PLATFORM_FEE_PERCENT).toBe(20);
    expect(PLATFORM_FEE_DECIMAL).toBe(0.2);
    expect(CREATOR_SHARE_DECIMAL).toBe(0.8);
    expect(PLATFORM_FEE_DECIMAL + CREATOR_SHARE_DECIMAL).toBe(1);
    expect(Math.floor(1000 * CREATOR_SHARE_DECIMAL)).toBe(800);
    expect(Math.floor(999 * PLATFORM_FEE_DECIMAL)).toBe(199);
  });
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
