import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeService } from './stripe.service.js';

// What the service asks the payment provider, and what it does with the
// answer. The provider's client is replaced: nothing here reaches it.
const client = {
  checkout: {
    sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() },
  },
  refunds: { create: vi.fn() },
  customers: { create: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
  subscriptions: { retrieve: vi.fn(), update: vi.fn(), cancel: vi.fn() },
  accounts: { create: vi.fn(), retrieve: vi.fn(), createLoginLink: vi.fn() },
  accountLinks: { create: vi.fn() },
  balance: { retrieve: vi.fn() },
  events: { list: vi.fn() },
  payouts: { list: vi.fn() },
  identity: { verificationSessions: { create: vi.fn(), retrieve: vi.fn() } },
};

const serviceWith = (env: Record<string, string | undefined> = {}) => {
  const service = new StripeService({
    get: vi.fn(
      (key: string) => ({ STRIPE_SECRET_KEY: 'sk_test_dummy', ...env })[key],
    ),
  } as unknown as ConfigService);
  (service as unknown as { stripe: unknown }).stripe = client;
  const warn = vi
    .spyOn(
      (service as unknown as { logger: { warn: () => void } }).logger,
      'warn',
    )
    .mockImplementation(() => {});
  return { service, warn };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StripeService at startup', () => {
  const prod = {
    NODE_ENV: 'production',
    STRIPE_SECRET_KEY: 'sk_live_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_fake',
    STRIPE_PAYMENT_METHOD_CONFIGURATION: 'pmc_1AbC2dEf',
  };

  it('starts in production with real settings, without a word', () => {
    const { service, warn } = serviceWith(prod);

    expect(() => service.onModuleInit()).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['a placeholder to change', 'sk_CHANGE_ME'],
    ['a dummy', 'sk_test_dummy'],
  ])(
    'refuses to start in production with a secret key that is %s',
    (_what, key) => {
      const { service } = serviceWith({ ...prod, STRIPE_SECRET_KEY: key });

      expect(() => service.onModuleInit()).toThrow(/STRIPE_SECRET_KEY/);
    },
  );

  it.each([
    ['missing', undefined],
    ['a placeholder to change', 'whsec_CHANGE_ME'],
    ['a dummy', 'whsec_dummy'],
  ])(
    'refuses to start in production with a webhook secret that is %s',
    (_what, secret) => {
      const { service } = serviceWith({
        ...prod,
        STRIPE_WEBHOOK_SECRET: secret,
      });

      expect(() => service.onModuleInit()).toThrow(/STRIPE_WEBHOOK_SECRET/);
    },
  );

  it('starts outside production with a dummy key, and says no real charge is made', () => {
    const { service, warn } = serviceWith();

    expect(() => service.onModuleInit()).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SIMULATOR'));
  });

  it('starts outside production with a test key, without a word', () => {
    const { service, warn } = serviceWith({ STRIPE_SECRET_KEY: 'sk_test_1' });

    service.onModuleInit();

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('StripeService checkout, customers and subscriptions', () => {
  const { service } = serviceWith();

  it('creates a checkout with what it is given, its request options included', async () => {
    client.checkout.sessions.create.mockResolvedValue({ id: 'cs_1' });
    const params = { mode: 'payment' } as never;
    const options = { idempotencyKey: 'key-1' };

    await expect(
      service.createCheckoutSession(params, options),
    ).resolves.toEqual({ id: 'cs_1' });
    expect(client.checkout.sessions.create).toHaveBeenCalledWith(
      params,
      options,
    );
  });

  it('reads and expires a checkout by its id', async () => {
    client.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_1' });
    client.checkout.sessions.expire.mockResolvedValue({ status: 'expired' });

    await service.getCheckoutSession('cs_1', { expand: ['line_items'] });
    await expect(service.expireCheckoutSession('cs_1')).resolves.toEqual({
      status: 'expired',
    });

    expect(client.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_1', {
      expand: ['line_items'],
    });
    expect(client.checkout.sessions.expire).toHaveBeenCalledWith('cs_1');
  });

  it('creates a customer and opens the billing portal for one', async () => {
    client.customers.create.mockResolvedValue({ id: 'cus_1' });
    client.billingPortal.sessions.create.mockResolvedValue({ url: 'portal' });

    await service.createCustomer('a@example.com', 'Ana', {
      idempotencyKey: 'key-2',
    });
    await service.createPortalSession('cus_1', 'https://app/back');

    expect(client.customers.create).toHaveBeenCalledWith(
      { email: 'a@example.com', name: 'Ana' },
      { idempotencyKey: 'key-2' },
    );
    expect(client.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://app/back',
    });
  });

  it('reads a subscription by its id', async () => {
    client.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1' });

    await expect(service.getSubscription('sub_1')).resolves.toEqual({
      id: 'sub_1',
    });
    expect(client.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
  });

  it('cancels a subscription at once unless asked to wait for the end of the period', async () => {
    await service.cancelSubscription('sub_1');
    expect(client.subscriptions.cancel).toHaveBeenCalledWith('sub_1');
    expect(client.subscriptions.update).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await service.cancelSubscription('sub_1', true);
    expect(client.subscriptions.update).toHaveBeenCalledWith('sub_1', {
      cancel_at_period_end: true,
    });
    expect(client.subscriptions.cancel).not.toHaveBeenCalled();
  });
});

describe('StripeService refund of a checkout', () => {
  const refund = (
    service: StripeService,
    amountInCents: number,
    extra: object = {},
  ) =>
    service.createRefundFromCheckoutSession({
      checkoutSessionId: 'cs_1',
      amountInCents,
      idempotencyKey: 'refund-key',
      ...extra,
    });

  it('refunds the payment of the checkout, once per key', async () => {
    const { service } = serviceWith();
    client.checkout.sessions.retrieve.mockResolvedValue({
      payment_intent: 'pi_1',
      amount_total: 1000,
    });
    client.refunds.create.mockResolvedValue({ id: 're_1' });

    await expect(
      refund(service, 400, { metadata: { promotionId: 'promo-1' } }),
    ).resolves.toEqual({ id: 're_1' });

    expect(client.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_1', {
      expand: ['payment_intent'],
    });
    expect(client.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_1',
        amount: 400,
        reason: 'requested_by_customer',
        metadata: { promotionId: 'promo-1' },
      },
      { idempotencyKey: 'refund-key' },
    );
  });

  it('never refunds more than was paid', async () => {
    const { service } = serviceWith();
    client.checkout.sessions.retrieve.mockResolvedValue({
      payment_intent: { id: 'pi_2' },
      amount_total: 300,
    });

    await refund(service, 5000, { reason: 'duplicate' });

    expect(client.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_2',
        amount: 300,
        reason: 'duplicate',
      }),
      expect.anything(),
    );
  });

  it('refunds what is asked when the provider does not say how much was paid', async () => {
    const { service } = serviceWith();
    client.checkout.sessions.retrieve.mockResolvedValue({
      payment_intent: 'pi_3',
      amount_total: null,
    });

    await refund(service, 250);

    expect(client.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 250 }),
      expect.anything(),
    );
  });

  it.each([0, -100])(
    'refunds nothing, and asks the provider nothing, for an amount of %i',
    async (amount) => {
      const { service } = serviceWith();

      await expect(refund(service, amount)).resolves.toBeNull();

      expect(client.checkout.sessions.retrieve).not.toHaveBeenCalled();
      expect(client.refunds.create).not.toHaveBeenCalled();
    },
  );

  it.each([null, undefined])(
    'refunds nothing for a checkout that was never paid (payment %s)',
    async (paymentIntent) => {
      const { service, warn } = serviceWith();
      client.checkout.sessions.retrieve.mockResolvedValue({
        payment_intent: paymentIntent,
        amount_total: 1000,
      });

      await expect(refund(service, 400)).resolves.toBeNull();

      expect(client.refunds.create).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    },
  );

  it('refunds nothing for a checkout that cost nothing', async () => {
    const { service } = serviceWith();
    client.checkout.sessions.retrieve.mockResolvedValue({
      payment_intent: 'pi_4',
      amount_total: 0,
    });

    await expect(refund(service, 400)).resolves.toBeNull();

    expect(client.refunds.create).not.toHaveBeenCalled();
  });
});

describe('StripeService refund of a payment to a creator', () => {
  it('refunds it in full, taking back the transfer and the fee, once per key', async () => {
    const { service } = serviceWith();
    client.refunds.create.mockResolvedValue({ id: 're_9' });

    await expect(
      service.refundDestinationCharge({
        paymentIntentId: 'pi_9',
        amountInCents: 499,
        idempotencyKey: 'key-9',
        metadata: { reason: 'gone' },
      }),
    ).resolves.toEqual({ id: 're_9' });

    expect(client.refunds.create).toHaveBeenCalledTimes(1);
    expect(client.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_9',
        amount: 499,
        reason: 'requested_by_customer',
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: { reason: 'gone' },
      },
      { idempotencyKey: 'key-9' },
    );
  });
});

describe('StripeService notices of the provider', () => {
  const payload = Buffer.from('{}');

  it('accepts a notice signed with the secret of the platform', () => {
    const { service } = serviceWith({
      STRIPE_WEBHOOK_SECRET: 'whsec_platform',
    });
    client.webhooks.constructEvent.mockReturnValue({ id: 'evt_1' });

    expect(service.constructEvent(payload, 'sig')).toEqual({ id: 'evt_1' });
    expect(client.webhooks.constructEvent).toHaveBeenCalledTimes(1);
    expect(client.webhooks.constructEvent).toHaveBeenCalledWith(
      payload,
      'sig',
      'whsec_platform',
    );
  });

  it('accepts a notice signed with the secret of creator accounts when the first does not match', () => {
    const { service } = serviceWith({
      STRIPE_WEBHOOK_SECRET: 'whsec_platform',
      STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect',
    });
    client.webhooks.constructEvent
      .mockImplementationOnce(() => {
        throw new Error('no match');
      })
      .mockReturnValueOnce({ id: 'evt_2' });

    expect(service.constructEvent(payload, 'sig')).toEqual({ id: 'evt_2' });
    expect(client.webhooks.constructEvent).toHaveBeenLastCalledWith(
      payload,
      'sig',
      'whsec_connect',
    );
  });

  it('refuses a notice that matches neither secret', () => {
    const { service } = serviceWith({
      STRIPE_WEBHOOK_SECRET: 'whsec_platform',
      STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect',
    });
    client.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('no match');
    });

    expect(() => service.constructEvent(payload, 'sig')).toThrow('no match');
    expect(client.webhooks.constructEvent).toHaveBeenCalledTimes(2);
  });

  it('refuses every notice when no secret is set, without reading it', () => {
    const { service } = serviceWith();

    expect(() => service.constructEvent(payload, 'sig')).toThrow(
      'STRIPE_WEBHOOK_SECRET is not configured',
    );
    expect(client.webhooks.constructEvent).not.toHaveBeenCalled();
  });
});

describe('StripeService event deliveries', () => {
  const { service } = serviceWith();

  it('lists the events not delivered in a window, of the platform or of one account', async () => {
    client.events.list.mockResolvedValue({
      data: [{ id: 'evt_1', type: 'account.updated', extra: 'dropped' }],
    });
    const window = {
      from: new Date('2026-10-28T12:00:00.000Z'),
      to: new Date('2026-10-29T11:00:00.000Z'),
    };

    await expect(service.listUndeliveredEvents(window)).resolves.toEqual([
      { id: 'evt_1', type: 'account.updated' },
    ]);
    expect(client.events.list).toHaveBeenLastCalledWith(
      {
        delivery_success: false,
        created: { gte: 1793188800, lte: 1793271600 },
        limit: 100,
      },
      undefined,
    );

    await service.listUndeliveredEvents(window, 'acct_1');
    expect(client.events.list).toHaveBeenLastCalledWith(expect.anything(), {
      stripeAccount: 'acct_1',
    });
  });
});

describe('StripeService creator accounts and identity', () => {
  const { service } = serviceWith();

  it('opens an Express account that asks only to receive transfers, paid out every Monday', async () => {
    await service.createExpressAccount('creator@example.com');

    expect(client.accounts.create).toHaveBeenCalledWith({
      type: 'express',
      email: 'creator@example.com',
      capabilities: { transfers: { requested: true } },
      settings: {
        payouts: { schedule: { interval: 'weekly', weekly_anchor: 'monday' } },
      },
    });
  });

  it('reads an account, and makes its onboarding and its panel links', async () => {
    await service.getAccount('acct_1');
    await service.createAccountLink(
      'acct_1',
      'https://app/back',
      'https://app/again',
    );
    await service.createLoginLink('acct_1');

    expect(client.accounts.retrieve).toHaveBeenCalledWith('acct_1');
    expect(client.accountLinks.create).toHaveBeenCalledWith({
      account: 'acct_1',
      refresh_url: 'https://app/again',
      return_url: 'https://app/back',
      type: 'account_onboarding',
    });
    expect(client.accounts.createLoginLink).toHaveBeenCalledWith('acct_1');
  });

  it('reads the balance and the payouts of the creator account, never of the platform', async () => {
    await service.getConnectBalance('acct_1');
    await service.listConnectPayouts('acct_1');
    await service.listConnectPayouts('acct_1', 3);

    expect(client.balance.retrieve).toHaveBeenCalledWith(
      {},
      { stripeAccount: 'acct_1' },
    );
    expect(client.payouts.list).toHaveBeenNthCalledWith(
      1,
      { limit: 10 },
      { stripeAccount: 'acct_1' },
    );
    expect(client.payouts.list).toHaveBeenNthCalledWith(
      2,
      { limit: 3 },
      { stripeAccount: 'acct_1' },
    );
  });

  it('asks for a document with a live capture and a matching selfie, tied to the person', async () => {
    await service.createIdentityVerificationSession(
      'user-1',
      'https://app/back',
    );

    expect(client.identity.verificationSessions.create).toHaveBeenCalledWith({
      type: 'document',
      metadata: { userId: 'user-1' },
      options: {
        document: { require_live_capture: true, require_matching_selfie: true },
      },
      return_url: 'https://app/back',
    });
  });

  it('reads a verification with what was verified', async () => {
    await service.getIdentityVerificationSession('vs_1');

    expect(client.identity.verificationSessions.retrieve).toHaveBeenCalledWith(
      'vs_1',
      { expand: ['verified_outputs'] },
    );
  });
});
