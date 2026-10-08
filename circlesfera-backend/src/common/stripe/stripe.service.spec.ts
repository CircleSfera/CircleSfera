import type { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyStripeError,
  deriveConnectAccountFlags,
  isVerifiedCompanyAccount,
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

describe('isVerifiedCompanyAccount', () => {
  const company = {
    business_type: 'company',
    details_submitted: true,
    capabilities: { transfers: 'active' },
    requirements: { currently_due: [], disabled_reason: null },
  };

  it('accepts a company the provider has nothing left to ask', () => {
    expect(isVerifiedCompanyAccount(company)).toBe(true);
  });

  it.each([
    ['a person', { business_type: 'individual' }],
    ['details not submitted', { details_submitted: false }],
    ['transfers not active', { capabilities: { transfers: 'pending' } }],
    ['something still due', { requirements: { currently_due: ['tax_id'] } }],
    ['a disabled account', { requirements: { disabled_reason: 'rejected' } }],
  ])('refuses %s', (_case, change) => {
    expect(isVerifiedCompanyAccount({ ...company, ...change })).toBe(false);
  });

  it('refuses an account it knows nothing about', () => {
    expect(isVerifiedCompanyAccount({})).toBe(false);
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

describe('StripeService card-only payment methods', () => {
  const serviceWith = (env: Record<string, string | undefined>) =>
    new StripeService({
      get: vi.fn(
        (key: string) => ({ STRIPE_SECRET_KEY: 'sk_test_dummy', ...env })[key],
      ),
    } as unknown as ConfigService);
  const prod = {
    NODE_ENV: 'production',
    STRIPE_SECRET_KEY: 'sk_live_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_fake',
  };

  it('limits one-off checkouts to the card-only configuration', () => {
    const service = serviceWith({
      STRIPE_PAYMENT_METHOD_CONFIGURATION: ' pmc_1AbC2dEf ',
    });
    expect(service.cardOnlyPaymentMethods()).toEqual({
      payment_method_configuration: 'pmc_1AbC2dEf',
    });
  });

  it('ignores a missing or malformed id outside production', () => {
    expect(serviceWith({}).cardOnlyPaymentMethods()).toEqual({});
    expect(
      serviceWith({
        STRIPE_PAYMENT_METHOD_CONFIGURATION: 'card',
      }).cardOnlyPaymentMethods(),
    ).toEqual({});
  });

  it('refuses to start in production without a valid configuration', () => {
    expect(() => serviceWith(prod).onModuleInit()).toThrow(
      /STRIPE_PAYMENT_METHOD_CONFIGURATION/,
    );
    expect(() =>
      serviceWith({
        ...prod,
        STRIPE_PAYMENT_METHOD_CONFIGURATION: 'pmc_1AbC2dEf',
      }).onModuleInit(),
    ).not.toThrow();
  });
});
