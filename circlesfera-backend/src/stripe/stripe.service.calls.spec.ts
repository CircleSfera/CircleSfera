import { ErrorCode } from '@circlesfera/shared';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isProviderErrorResponse, StripeService } from './stripe.service.js';

// What the service asks the payment provider, and what it does with the
// answer. The provider's client is replaced: nothing here reaches it.
const client = {
  checkout: {
    sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() },
  },
  refunds: { create: vi.fn(), list: vi.fn() },
  paymentIntents: { retrieve: vi.fn() },
  invoices: { list: vi.fn(), voidInvoice: vi.fn() },
  invoicePayments: { list: vi.fn() },
  customers: { create: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
  subscriptions: { retrieve: vi.fn(), update: vi.fn(), cancel: vi.fn() },
  charges: { retrieve: vi.fn() },
  events: { list: vi.fn() },
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
  client.paymentIntents.retrieve.mockResolvedValue({ amount_received: 999 });
});

describe('StripeService at startup', () => {
  const prod = {
    NODE_ENV: 'production',
    STRIPE_SECRET_KEY: 'sk_live_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_fake',
    STRIPE_PAYMENT_METHOD_CONFIGURATION: 'pmc_1AbC2dEf',
    STRIPE_IDENTITY_KEY: 'rk_live_fake',
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
    const { service, warn } = serviceWith({
      STRIPE_SECRET_KEY: 'sk_test_1',
      STRIPE_IDENTITY_KEY: 'rk_test_1',
    });

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

  describe('while staff pause payments', () => {
    const withPayments = (enabled: boolean) => {
      const isEnabled = vi.fn().mockResolvedValue(enabled);
      const paused = new StripeService(
        {
          get: vi.fn((key: string) =>
            key === 'STRIPE_SECRET_KEY' ? 'sk_test_dummy' : undefined,
          ),
        } as unknown as ConfigService,
        { isEnabled } as never,
      );
      (paused as unknown as { stripe: unknown }).stripe = client;
      return { paused, isEnabled };
    };

    it('opens no checkout and says payments are paused', async () => {
      const { paused, isEnabled } = withPayments(false);

      await expect(
        paused.createCheckoutSession({ mode: 'payment' } as never),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.PAYMENTS_PAUSED,
        status: 503,
      });
      expect(isEnabled).toHaveBeenCalledWith('payments_enabled');
      expect(client.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('lets a flow ask before it reaches Stripe, and answers when payments are on', async () => {
      await expect(
        withPayments(false).paused.assertPaymentsEnabled(),
      ).rejects.toMatchObject({ errorCode: ErrorCode.PAYMENTS_PAUSED });
      await expect(
        withPayments(true).paused.assertPaymentsEnabled(),
      ).resolves.toBeUndefined();
    });

    it('opens the checkout once payments are on', async () => {
      const { paused } = withPayments(true);
      client.checkout.sessions.create.mockResolvedValue({ id: 'cs_2' });

      await expect(
        paused.createCheckoutSession({ mode: 'payment' } as never),
      ).resolves.toEqual({ id: 'cs_2' });
    });
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

  it('resumes a subscription cancelled at the end of its period', async () => {
    await service.resumeSubscription('sub_1');
    expect(client.subscriptions.update).toHaveBeenCalledWith('sub_1', {
      cancel_at_period_end: false,
    });
  });

  it('reads a subscription with its latest invoice', async () => {
    await service.getSubscriptionWithInvoice('sub_1');
    expect(client.subscriptions.retrieve).toHaveBeenCalledWith('sub_1', {
      expand: ['latest_invoice'],
    });
  });

  it('moves a subscription to another price now, crediting the rest of the period, and applies it only once the charge is paid', async () => {
    await service.switchSubscriptionPrice({
      subscriptionId: 'sub_1',
      itemId: 'si_1',
      priceId: 'price_year',
      metadata: { plan_start_consent: 'accepted' },
      idempotencyKey: 'plan_yearly_key',
    });
    expect(client.subscriptions.update).toHaveBeenCalledWith(
      'sub_1',
      {
        items: [{ id: 'si_1', price: 'price_year' }],
        proration_behavior: 'always_invoice',
        billing_cycle_anchor: { type: 'now' },
        payment_behavior: 'pending_if_incomplete',
        metadata: { plan_start_consent: 'accepted' },
        expand: ['latest_invoice'],
      },
      { idempotencyKey: 'plan_yearly_key' },
    );
  });
});

describe('StripeService withdrawal from a plan', () => {
  // The provider's list, as the library pages through it.
  const listOf = (items: object[]) => ({
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  });
  const at = (iso: string) => new Date(iso).getTime() / 1000;
  const refund = (service: StripeService, over: object = {}) =>
    service.refundSubscriptionPayment({
      paymentIntentId: 'pi_1',
      amountInCents: 666,
      idempotencyKey: 'plan-withdrawal-sub_1',
      metadata: { reason: 'withdrawal', platformSubscriptionId: 'ps_1' },
      ...over,
    });

  it('ends a subscription now, with no credit and no final invoice', async () => {
    const { service } = serviceWith();
    client.subscriptions.cancel.mockResolvedValue({ id: 'sub_1' });

    await service.endSubscriptionNow('sub_1');

    expect(client.subscriptions.cancel).toHaveBeenCalledWith('sub_1', {
      prorate: false,
      invoice_now: false,
    });
  });

  it('reads the newest paid invoice: what was paid, the period of its charged lines and the payment it came from', async () => {
    const { service } = serviceWith();
    client.invoices.list.mockResolvedValue({
      data: [
        {
          id: 'in_1',
          total: 999,
          amount_paid: 999,
          currency: 'eur',
          // The invoice's own period is the one before it.
          period_start: at('2026-11-01T00:00:00Z'),
          period_end: at('2026-11-01T00:00:00Z'),
          lines: {
            data: [
              {
                amount: 999,
                period: {
                  start: at('2026-11-01T00:00:00Z'),
                  end: at('2026-12-01T00:00:00Z'),
                },
              },
              { amount: 0, period: { start: 0, end: 1 } },
            ],
          },
        },
      ],
    });
    client.invoicePayments.list.mockResolvedValue({
      data: [{ amount_paid: 999, payment: { payment_intent: 'pi_1' } }],
    });

    await expect(service.latestPaidInvoice('sub_1')).resolves.toEqual({
      id: 'in_1',
      totalCents: 999,
      amountPaidCents: 999,
      paidCents: 999,
      creditCents: 0,
      currency: 'eur',
      periodStart: new Date('2026-11-01T00:00:00Z'),
      periodEnd: new Date('2026-12-01T00:00:00Z'),
      paymentIntentId: 'pi_1',
    });
    expect(client.invoices.list).toHaveBeenCalledWith({
      subscription: 'sub_1',
      status: 'paid',
      limit: 1,
    });
    expect(client.invoicePayments.list).toHaveBeenCalledWith({
      invoice: 'in_1',
      status: 'paid',
    });
  });

  it('reads the credit taken off inside the invoice of a move to another price, and the period of the year charged', async () => {
    const { service } = serviceWith();
    client.invoices.list.mockResolvedValue({
      data: [
        {
          id: 'in_move',
          total: 8991,
          amount_paid: 8991,
          currency: 'eur',
          period_start: at('2026-11-01T00:00:00Z'),
          period_end: at('2026-11-01T00:00:00Z'),
          lines: {
            data: [
              // The unused part of the month, given back.
              {
                amount: -999,
                parent: { subscription_item_details: { proration: true } },
                period: {
                  start: at('2026-11-01T00:00:00Z'),
                  end: at('2026-12-01T00:00:00Z'),
                },
              },
              {
                amount: 9990,
                period: {
                  start: at('2026-11-01T00:00:00Z'),
                  end: at('2027-11-01T00:00:00Z'),
                },
              },
              // A credit of another kind is not the move's.
              {
                amount: -500,
                parent: { invoice_item_details: { proration: false } },
                period: { start: 0, end: 1 },
              },
            ],
          },
        },
      ],
    });
    client.invoicePayments.list.mockResolvedValue({
      data: [{ amount_paid: 8991, payment: { payment_intent: 'pi_2' } }],
    });

    await expect(service.latestPaidInvoice('sub_1')).resolves.toMatchObject({
      totalCents: 8991,
      creditCents: 999,
      periodStart: new Date('2026-11-01T00:00:00Z'),
      periodEnd: new Date('2027-11-01T00:00:00Z'),
    });
  });

  it('has no paid invoice for a subscription never paid, and no payment for an invoice that cost nothing', async () => {
    const { service } = serviceWith();
    client.invoices.list.mockResolvedValueOnce({ data: [] });
    await expect(service.latestPaidInvoice('sub_1')).resolves.toBeNull();

    client.invoices.list.mockResolvedValueOnce({
      data: [
        {
          id: 'in_0',
          amount_paid: 0,
          currency: 'eur',
          period_start: 1,
          period_end: 2,
          lines: { data: [] },
        },
      ],
    });
    await expect(service.latestPaidInvoice('sub_1')).resolves.toMatchObject({
      amountPaidCents: 0,
      paymentIntentId: null,
    });
    expect(client.invoicePayments.list).not.toHaveBeenCalled();
  });

  it('refunds the amount asked on the payment, as asked by the customer, once per key', async () => {
    const { service } = serviceWith();
    client.refunds.list.mockReturnValue(listOf([]));
    client.refunds.create.mockResolvedValue({ id: 're_1', amount: 666 });

    await expect(refund(service)).resolves.toEqual({ id: 're_1', amount: 666 });
    expect(client.refunds.list).toHaveBeenCalledWith({
      payment_intent: 'pi_1',
      limit: 100,
    });
    expect(client.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_1',
        amount: 666,
        reason: 'requested_by_customer',
        metadata: { reason: 'withdrawal', platformSubscriptionId: 'ps_1' },
      },
      { idempotencyKey: 'plan-withdrawal-sub_1-0' },
    );
  });

  it('never refunds more than is left of the payment after earlier refunds', async () => {
    const { service } = serviceWith();
    client.paymentIntents.retrieve.mockResolvedValue({ amount_received: 999 });
    client.refunds.list.mockReturnValue(
      listOf([
        { amount: 500, status: 'succeeded', metadata: {} },
        // A failed refund gave nothing back.
        { amount: 400, status: 'failed', metadata: {} },
      ]),
    );
    client.refunds.create.mockResolvedValue({ id: 're_2', amount: 499 });

    await refund(service);

    // What the payment received, less what stands refunded of it.
    expect(client.paymentIntents.retrieve).toHaveBeenCalledWith('pi_1');
    expect(client.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 499 }),
      expect.anything(),
    );
  });

  it('tells an error the provider answered from an outcome that is not known', () => {
    expect(
      isProviderErrorResponse({ type: 'StripeAPIError', statusCode: 500 }),
    ).toBe(true);
    expect(
      isProviderErrorResponse({
        type: 'StripeInvalidRequestError',
        statusCode: 400,
      }),
    ).toBe(true);
    // The connection failed: the provider may have done it.
    expect(isProviderErrorResponse({ type: 'StripeConnectionError' })).toBe(
      false,
    );
    expect(
      isProviderErrorResponse({
        type: 'StripeConnectionError',
        statusCode: 500,
      }),
    ).toBe(false);
    expect(isProviderErrorResponse(new Error('socket hang up'))).toBe(false);
    expect(isProviderErrorResponse(null)).toBe(false);
  });

  it('refunds nothing when nothing is asked or nothing is left', async () => {
    const { service } = serviceWith();
    await expect(refund(service, { amountInCents: 0 })).resolves.toBeNull();

    client.paymentIntents.retrieve.mockResolvedValue({ amount_received: 999 });
    client.refunds.list.mockReturnValue(
      listOf([{ amount: 999, status: 'succeeded', metadata: {} }]),
    );
    await expect(refund(service)).resolves.toBeNull();
    expect(client.refunds.create).not.toHaveBeenCalled();
  });

  it('returns the withdrawal refund already made instead of refunding twice', async () => {
    const { service } = serviceWith();
    const earlier = {
      id: 're_1',
      amount: 666,
      status: 'succeeded',
      metadata: { reason: 'withdrawal', platformSubscriptionId: 'ps_1' },
    };
    client.refunds.list.mockReturnValue(listOf([earlier]));

    await expect(refund(service, { amountInCents: 650 })).resolves.toBe(
      earlier,
    );
    expect(client.refunds.create).not.toHaveBeenCalled();
  });

  it('returns a withdrawal refund still pending on the bank instead of refunding twice', async () => {
    const { service } = serviceWith();
    const pending = {
      id: 're_1',
      amount: 666,
      status: 'pending',
      metadata: { reason: 'withdrawal', platformSubscriptionId: 'ps_1' },
    };
    client.refunds.list.mockReturnValue(listOf([pending]));

    await expect(refund(service)).resolves.toBe(pending);
    expect(client.refunds.create).not.toHaveBeenCalled();
  });

  it('refunds again after a withdrawal refund failed, with a new key, not counting what gave nothing back', async () => {
    const { service } = serviceWith();
    client.refunds.list.mockReturnValue(
      listOf([
        {
          id: 're_failed',
          amount: 666,
          status: 'failed',
          metadata: { reason: 'withdrawal', platformSubscriptionId: 'ps_1' },
        },
        {
          id: 're_canceled',
          amount: 666,
          status: 'canceled',
          metadata: { reason: 'withdrawal', platformSubscriptionId: 'ps_1' },
        },
      ]),
    );
    client.refunds.create.mockResolvedValue({ id: 're_3', amount: 666 });

    await expect(refund(service)).resolves.toEqual({ id: 're_3', amount: 666 });
    expect(client.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 666 }),
      { idempotencyKey: 'plan-withdrawal-sub_1-2' },
    );
  });

  it('voids every open invoice of the subscription, leaving one paid or voided meanwhile', async () => {
    const { service } = serviceWith();
    client.invoices.list.mockReturnValue(
      listOf([{ id: 'in_1' }, { id: 'in_2' }]),
    );
    client.invoices.voidInvoice
      .mockResolvedValueOnce({ id: 'in_1' })
      .mockRejectedValueOnce(
        Object.assign(new Error('already paid'), {
          type: 'StripeInvalidRequestError',
        }),
      );

    await expect(service.voidOpenInvoices('sub_1')).resolves.toBe(1);
    expect(client.invoices.list).toHaveBeenCalledWith({
      subscription: 'sub_1',
      status: 'open',
      limit: 100,
    });
    expect(client.invoices.voidInvoice).toHaveBeenCalledWith('in_1');
    expect(client.invoices.voidInvoice).toHaveBeenCalledWith('in_2');
  });

  it('throws when an open invoice cannot be voided for another reason', async () => {
    const { service } = serviceWith();
    client.invoices.list.mockReturnValue(listOf([{ id: 'in_1' }]));
    client.invoices.voidInvoice.mockRejectedValueOnce(
      Object.assign(new Error('down'), { type: 'StripeAPIError' }),
    );

    await expect(service.voidOpenInvoices('sub_1')).rejects.toThrow('down');
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

  it('refuses a notice that does not match the secret', () => {
    const { service } = serviceWith({
      STRIPE_WEBHOOK_SECRET: 'whsec_platform',
    });
    client.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('no match');
    });

    expect(() => service.constructEvent(payload, 'sig')).toThrow('no match');
    expect(client.webhooks.constructEvent).toHaveBeenCalledTimes(1);
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

  it('lists the events of the platform not delivered in a window', async () => {
    client.events.list.mockResolvedValue({
      data: [{ id: 'evt_1', type: 'charge.refunded', extra: 'dropped' }],
    });
    const window = {
      from: new Date('2026-10-28T12:00:00.000Z'),
      to: new Date('2026-10-29T11:00:00.000Z'),
    };

    await expect(service.listUndeliveredEvents(window)).resolves.toEqual([
      { id: 'evt_1', type: 'charge.refunded' },
    ]);
    expect(client.events.list).toHaveBeenLastCalledWith({
      delivery_success: false,
      created: { gte: 1793188800, lte: 1793271600 },
      limit: 100,
    });
  });
});

describe('StripeService identity', () => {
  const { service } = serviceWith();

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

  it('reads a verification with what was verified, without the date of birth the secret key is refused', async () => {
    await service.getIdentityVerificationSession('vs_1');

    expect(client.identity.verificationSessions.retrieve).toHaveBeenCalledWith(
      'vs_1',
      { expand: ['verified_outputs'] },
    );
  });
});

describe('StripeService reading the date of birth of an identity', () => {
  const reader = {
    identity: { verificationSessions: { retrieve: vi.fn() } },
  };
  const readerOf = (service: StripeService) =>
    (service as unknown as { identityReader: unknown }).identityReader;

  it('asks for the date of birth by name, with the restricted identity key', async () => {
    const { service } = serviceWith({ STRIPE_IDENTITY_KEY: 'rk_test_abc' });
    expect(readerOf(service)).not.toBeNull();
    (service as unknown as { identityReader: unknown }).identityReader = reader;

    await service.getIdentityVerificationSession('vs_1');

    expect(reader.identity.verificationSessions.retrieve).toHaveBeenCalledWith(
      'vs_1',
      { expand: ['verified_outputs', 'verified_outputs.dob'] },
    );
    expect(
      client.identity.verificationSessions.retrieve,
    ).not.toHaveBeenCalled();
  });

  it('reads it with the main key when that key is itself restricted', () => {
    const { service } = serviceWith({ STRIPE_SECRET_KEY: 'rk_live_main' });
    expect(readerOf(service)).not.toBeNull();
  });

  it.each([
    ['a secret key', 'sk_test_abc'],
    ['a key of the other mode', 'rk_live_abc'],
    ['nothing', undefined],
  ])('does not read it with %s as the identity key', (_label, key) => {
    const { service } = serviceWith({ STRIPE_IDENTITY_KEY: key });
    expect(readerOf(service)).toBeNull();
  });

  it('says at startup that nobody can pay without it, and not when it is set', () => {
    const real = { STRIPE_SECRET_KEY: 'sk_test_real' };
    const without = serviceWith(real);
    without.service.onModuleInit();
    expect(without.warn).toHaveBeenCalledWith(
      expect.stringContaining('STRIPE_IDENTITY_KEY'),
    );

    const withKey = serviceWith({ ...real, STRIPE_IDENTITY_KEY: 'rk_test_x' });
    // One spy on the loggers' shared method: only what follows counts.
    withKey.warn.mockClear();
    withKey.service.onModuleInit();
    expect(withKey.warn).not.toHaveBeenCalled();
  });
});
