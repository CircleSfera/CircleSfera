import { describe, expect, it } from 'vitest';
import { promotionMaxShows } from './promotion-reach.js';

describe('promotionMaxShows', () => {
  it('is the budget in cents, one show a cent, once per person a day', () => {
    // €5 a day for 7 days.
    expect(promotionMaxShows(500, 7)).toBe(3500);
    // €50 a day for 30 days.
    expect(promotionMaxShows(5000, 30)).toBe(150_000);
  });
});
