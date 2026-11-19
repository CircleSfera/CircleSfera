import { ErrorCode } from '@circlesfera/shared';
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

  it('reads a verification with what was verified', async () => {
    await service.getIdentityVerificationSession('vs_1');

    expect(client.identity.verificationSessions.retrieve).toHaveBeenCalledWith(
      'vs_1',
      { expand: ['verified_outputs'] },
    );
  });
});
