import type { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyStripeError,
  deriveConnectAccountFlags,
  StripeService,
} from './stripe.service.js';

/** A minimal async-iterable stand-in for Stripe's paginated ApiListPromise. */
function fakePaginatedList<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async () =>
          i < items.length
            ? { value: items[i++], done: false }
            : { value: undefined, done: true },
      };
    },
  } as AsyncIterable<T>;
}

describe('classifyStripeError', () => {
  it('treats a non-StripeError as transient', () => {
    expect(classifyStripeError(new Error('boom'))).toBe('transient');
    expect(classifyStripeError('some string')).toBe('transient');
    expect(classifyStripeError(null)).toBe('transient');
  });

  it('treats StripeConnectionError as transient', () => {
    expect(classifyStripeError(new Stripe.errors.StripeConnectionError())).toBe(
      'transient',
    );
  });

  it('treats StripeAPIError as transient', () => {
    expect(classifyStripeError(new Stripe.errors.StripeAPIError())).toBe(
      'transient',
    );
  });

  it('treats StripeRateLimitError as transient', () => {
    expect(classifyStripeError(new Stripe.errors.StripeRateLimitError())).toBe(
      'transient',
    );
  });

  it('treats StripeCardError as permanent', () => {
    expect(classifyStripeError(new Stripe.errors.StripeCardError())).toBe(
      'permanent',
    );
  });

  it('treats StripeInvalidRequestError as permanent', () => {
    expect(
      classifyStripeError(new Stripe.errors.StripeInvalidRequestError()),
    ).toBe('permanent');
  });

  it('treats StripeAuthenticationError as permanent', () => {
    expect(
      classifyStripeError(new Stripe.errors.StripeAuthenticationError()),
    ).toBe('permanent');
  });
});

describe('deriveConnectAccountFlags', () => {
  // Single source of truth shared by monetization.service.ts's on-demand
  // getAccountStatus poll and payments.service.ts's account.updated webhook.
  it('enables both flags when transfers are active and charges are enabled', () => {
    expect(
      deriveConnectAccountFlags({
        charges_enabled: true,
        capabilities: { transfers: 'active' },
      }),
    ).toEqual({ transfersEnabled: true, chargesEnabled: true });
  });

  it('disables transfersEnabled for any non-active capability state', () => {
    expect(
      deriveConnectAccountFlags({
        charges_enabled: true,
        capabilities: { transfers: 'pending' },
      }),
    ).toEqual({ transfersEnabled: false, chargesEnabled: true });
  });

  it('handles a missing capabilities object or charges_enabled field', () => {
    expect(deriveConnectAccountFlags({})).toEqual({
      transfersEnabled: false,
      chargesEnabled: false,
    });
    expect(
      deriveConnectAccountFlags({ capabilities: null, charges_enabled: null }),
    ).toEqual({ transfersEnabled: false, chargesEnabled: false });
  });
});

describe('StripeService.listSubscriptionsForCustomer', () => {
  const mockConfigService = {
    get: vi.fn().mockReturnValue('sk_test_dummy'),
  } as unknown as ConfigService;

  it('collects every subscription across pages instead of only the first page', () => {
    // Regression test (CodeRabbit finding on #90): Stripe's subscriptions.list
    // defaults to 10 per page; this must auto-paginate so a customer with
    // 10+ subscriptions doesn't leave some uncanceled after account deletion.
    const service = new StripeService(mockConfigService);
    const subscriptions = Array.from({ length: 23 }, (_, i) => ({
      id: `sub_${i}`,
    }));
    (service.stripe.subscriptions as unknown as { list: unknown }).list = vi
      .fn()
      .mockReturnValue(fakePaginatedList(subscriptions));

    return service.listSubscriptionsForCustomer('cus_123').then((result) => {
      expect(result).toHaveLength(23);
      expect(result.map((s) => s.id)).toEqual(subscriptions.map((s) => s.id));
    });
  });

  it('returns an empty array when the customer has no subscriptions', async () => {
    const service = new StripeService(mockConfigService);
    (service.stripe.subscriptions as unknown as { list: unknown }).list = vi
      .fn()
      .mockReturnValue(fakePaginatedList([]));

    await expect(
      service.listSubscriptionsForCustomer('cus_none'),
    ).resolves.toEqual([]);
  });
});
