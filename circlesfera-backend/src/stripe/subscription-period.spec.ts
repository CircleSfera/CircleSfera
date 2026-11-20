import { describe, expect, it } from 'vitest';
import { subscriptionPeriod } from './subscription-period.js';

describe('subscriptionPeriod', () => {
  it('reads the billing period from the subscription item', () => {
    expect(
      subscriptionPeriod({
        id: 'sub_1',
        items: {
          data: [
            {
              current_period_start: 1_793_469_164,
              current_period_end: 1_796_061_164,
            },
          ],
        },
      }),
    ).toEqual({
      start: new Date(1_793_469_164_000),
      end: new Date(1_796_061_164_000),
    });
  });

  it('refuses a subscription whose period is only on the subscription itself', () => {
    expect(() =>
      subscriptionPeriod({
        id: 'sub_old',
        current_period_start: 1,
        current_period_end: 2,
      } as never),
    ).toThrow('Subscription sub_old has no billing period on its item');
  });

  it('refuses a subscription with no item', () => {
    expect(() => subscriptionPeriod({ items: { data: [] } })).toThrow(
      /no billing period/,
    );
    expect(() => subscriptionPeriod({})).toThrow(/no billing period/);
  });

  it('refuses an item missing one of the two dates', () => {
    expect(() =>
      subscriptionPeriod({
        items: { data: [{ current_period_start: 1 }] },
      }),
    ).toThrow(/no billing period/);
  });
});
