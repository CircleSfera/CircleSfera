import { describe, expect, it } from 'vitest';
import { creatorEarnings, keptWithoutVat } from './paid-amounts.js';

describe('paid amounts', () => {
  it('keeps the price without VAT of a payment nothing was refunded of', () => {
    expect(keptWithoutVat(1000, 174)).toBe(826);
    expect(creatorEarnings(1000, 174)).toBe(661);
  });

  it('keeps the same part of the price without VAT as of what was paid, rounded down', () => {
    expect(keptWithoutVat(1000, 174, 500)).toBe(413);
    expect(creatorEarnings(1000, 174, 500)).toBe(331);
    expect(keptWithoutVat(999, 173, 1)).toBe(825);
  });

  it('keeps nothing of a payment refunded in full, or of nothing paid', () => {
    expect(keptWithoutVat(1000, 174, 1000)).toBe(0);
    expect(keptWithoutVat(1000, 174, 1200)).toBe(0);
    expect(keptWithoutVat(0, 0)).toBe(0);
    expect(creatorEarnings(1000, 174, 1000)).toBe(0);
  });
});
