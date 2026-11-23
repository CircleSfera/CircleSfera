import { ErrorCode } from '@circlesfera/shared';
import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { AppException } from '../common/errors/app.exception.js';
import { SYSTEM_SETTING_KEYS } from '../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { usableWebhookSecret } from './stripe-webhook-secrets.js';

// A Stripe Payment Method Configuration id (pmc_...).
const PAYMENT_METHOD_CONFIGURATION = /^pmc_[A-Za-z0-9]+$/;
// A restricted key of the payment provider, and the mode of any key.
const RESTRICTED_KEY = /^rk_(?:live|test)_/;
const keyMode = (key: string) => /^(?:sk|rk)_(live|test)_/.exec(key)?.[1];

// The API version every request names: the one the installed library is
// typed for, so moving the library to a new version fails the type check
// until this moves with it.
const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2026-11-18.endive';

// The newest paid invoice of a subscription. Amounts are integer cents:
// `totalCents` is what the invoice came to (0 for a free one),
// `amountPaidCents` what was paid of it by a payment (not from the
// customer's balance or a credit), `paidCents` the part of it paid with
// `paymentIntentId` (what can be refunded on it).
export interface PaidSubscriptionInvoice {
  id: string;
  totalCents: number;
  amountPaidCents: number;
  paidCents: number;
  // The proration credit taken off inside the invoice (the unused part of an
  // earlier period, when the plan moved to another price), in cents. Zero
  // for an ordinary renewal; any other credit is not counted.
  creditCents: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  paymentIntentId: string | null;
}

@Injectable()
export class StripeService implements OnModuleInit {
  public readonly stripe: Stripe;
  // Reads identity verifications with the date of birth read from the
  // document. The provider gives that date only to a restricted key with
  // the "Identity Verification Results" and "Recent Detailed Verification
  // Results" read permissions, and only when it is asked for by name: never
  // to the secret key. It is STRIPE_IDENTITY_KEY, or the main key when that
  // is itself restricted; null when there is none, and then no date of
  // birth is read and nobody can be shown to be an adult payer.
  private readonly identityReader: Stripe | null;
  private readonly logger = new Logger(StripeService.name);

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    // Read on every new checkout: staff can pause new payments.
    @Optional()
    @Inject(SystemSettingsService)
    private readonly systemSettings?: SystemSettingsService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY') || '';
    const options: Stripe.StripeConfig = {
      apiVersion: STRIPE_API_VERSION,
      timeout: 20_000,
      maxNetworkRetries: 2,
    };
    this.stripe = new Stripe(secretKey, options);
    const identityKey = this.identityKey();
    this.identityReader = identityKey
      ? identityKey === secretKey
        ? this.stripe
        : new Stripe(identityKey, options)
      : null;
  }

  // The restricted key that reads dates of birth: STRIPE_IDENTITY_KEY when
  // it is one, of the same mode (test or live) as the main key; otherwise
  // the main key when it is restricted.
  private identityKey(): string | undefined {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY') || '';
    const identityKey =
      this.configService.get<string>('STRIPE_IDENTITY_KEY')?.trim() || '';
    if (
      RESTRICTED_KEY.test(identityKey) &&
      keyMode(identityKey) === keyMode(secretKey)
    ) {
      return identityKey;
    }
    return RESTRICTED_KEY.test(secretKey) ? secretKey : undefined;
  }

  // Validate that required Stripe keys are present on startup.
  onModuleInit() {
    const isProd = this.configService.get('NODE_ENV') === 'production';
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (isProd) {
      if (
        !secretKey ||
        secretKey.includes('CHANGE_ME') ||
        secretKey.includes('dummy')
      ) {
        throw new Error(
          'SECURITY ALERT: STRIPE_SECRET_KEY is missing or placeholder in production.',
        );
      }
      if (
        !webhookSecret ||
        webhookSecret.includes('CHANGE_ME') ||
        webhookSecret.includes('dummy')
      ) {
        throw new Error(
          'SECURITY ALERT: STRIPE_WEBHOOK_SECRET is missing or placeholder in production.',
        );
      }
    }

    if (isProd && !this.cardOnlyConfigurationId()) {
      throw new Error(
        'STRIPE_PAYMENT_METHOD_CONFIGURATION (pmc_...) is missing or invalid in production.',
      );
    }

    if (!secretKey || secretKey.includes('dummy')) {
      this.logger.warn(
        'Stripe is running in SIMULATOR mode — no real charges will be processed.',
      );
    } else if (!this.identityKey()) {
      // Said, not refused: everything else works without it.
      this.logger.warn(
        'STRIPE_IDENTITY_KEY is not a restricted key of the same mode as STRIPE_SECRET_KEY: dates of birth are not read from identity documents, so nobody can be shown to be an adult payer and nobody can pay.',
      );
    }
  }

  // Checkout parameters that limit a one-off payment on CircleSfera's own
  // account (a promotion) to the payment methods of the card-only Payment
  // Method Configuration set in the Stripe Dashboard (owner decision).
  // Production refuses to start without it; elsewhere Checkout falls back to
  // the methods enabled in the Dashboard.
  cardOnlyPaymentMethods(): Pick<
    Stripe.Checkout.SessionCreateParams,
    'payment_method_configuration'
  > {
    const id = this.cardOnlyConfigurationId();
    return id ? { payment_method_configuration: id } : {};
  }

  private cardOnlyConfigurationId(): string | undefined {
    const id = this.configService
      .get<string>('STRIPE_PAYMENT_METHOD_CONFIGURATION')
      ?.trim();
    return id && PAYMENT_METHOD_CONFIGURATION.test(id) ? id : undefined;
  }

  async createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
    options?: Stripe.RequestOptions,
  ): Promise<Stripe.Checkout.Session> {
    // Every new payment starts here, so pausing payments stops them all:
    // plans and promotions.
    await this.assertPaymentsEnabled();
    return this.stripe.checkout.sessions.create(params, options);
  }

  // Refuses a new payment while staff have paused payments. A flow that asks
  // Stripe something before its checkout (a customer to create) calls it
  // first, so a paused payment never reaches Stripe at all.
  async assertPaymentsEnabled(): Promise<void> {
    if (
      this.systemSettings &&
      !(await this.systemSettings.isEnabled(
        SYSTEM_SETTING_KEYS.PAYMENTS_ENABLED,
      ))
    ) {
      throw new AppException(
        ErrorCode.PAYMENTS_PAUSED,
        HttpStatus.SERVICE_UNAVAILABLE,
        'Payments are paused for now.',
      );
    }
  }

  // Retrieve a Checkout Session (optionally expanded).
  // Note: promotions store the Checkout Session ID in `stripePaymentIntentId`.
  async getCheckoutSession(
    sessionId: string,
    params?: Stripe.Checkout.SessionRetrieveParams,
  ): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.retrieve(sessionId, params);
  }

  // Expire an open Checkout Session (e.g. unpaid PENDING promotion cancelled).
  async expireCheckoutSession(
    sessionId: string,
  ): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.expire(sessionId);
  }

  // Create a partial/full refund against the PaymentIntent of a Checkout Session.
  // Returns null when the session has no charge to refund.
  async createRefundFromCheckoutSession(params: {
    checkoutSessionId: string;
    amountInCents: number;
    reason?: Stripe.RefundCreateParams.Reason;
    idempotencyKey: string;
    metadata?: Stripe.MetadataParam;
  }): Promise<Stripe.Refund | null> {
    if (params.amountInCents <= 0) {
      return null;
    }

    const session = await this.getCheckoutSession(params.checkoutSessionId, {
      expand: ['payment_intent'],
    });

    const paymentIntent =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;

    if (!paymentIntent) {
      this.logger.warn(
        `Checkout session ${params.checkoutSessionId} has no payment_intent; skipping refund`,
      );
      return null;
    }

    const chargeable =
      typeof session.amount_total === 'number' ? session.amount_total : null;
    const amount =
      chargeable !== null
        ? Math.min(params.amountInCents, chargeable)
        : params.amountInCents;

    if (amount <= 0) {
      return null;
    }

    return this.stripe.refunds.create(
      {
        payment_intent: paymentIntent,
        amount,
        reason: params.reason ?? 'requested_by_customer',
        metadata: params.metadata,
      },
      { idempotencyKey: params.idempotencyKey },
    );
  }

  async createCustomer(
    email: string,
    name?: string,
    options?: Stripe.RequestOptions,
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.create({ email, name }, options);
  }

  async createPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  // Verify and construct a Stripe webhook event from a raw body + signature.
  constructEvent(payload: Buffer, sig: string): any {
    const secret = usableWebhookSecret(
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET'),
    );
    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }
    return this.stripe.webhooks.constructEvent(payload, sig, secret);
  }

  // The customer a charge was made to, when it has one.
  async getChargeCustomerId(chargeId: string): Promise<string | undefined> {
    const { customer } = await this.stripe.charges.retrieve(chargeId);
    return (
      (typeof customer === 'string' ? customer : customer?.id) ?? undefined
    );
  }

  // Retrieve a Stripe Subscription object by ID.
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  // A subscription with its latest invoice, to see whether a change waits
  // on a charge and the page to pay it.
  async getSubscriptionWithInvoice(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice'],
    });
  }

  // List all Subscriptions for a Customer (e.g. account-deletion cleanup).
  async listSubscriptionsForCustomer(
    customerId: string,
  ): Promise<Stripe.Subscription[]> {
    // Stripe returns at most 10 subscriptions per page by default — auto-
    // paginate so a customer with 10+ subscriptions doesn't leave some
    // active (and billing) after account-deletion cleanup.
    const subscriptions: Stripe.Subscription[] = [];
    for await (const subscription of this.stripe.subscriptions.list({
      customer: customerId,
    })) {
      subscriptions.push(subscription);
    }
    return subscriptions;
  }

  async cancelSubscription(
    subscriptionId: string,
    atPeriodEnd = false,
  ): Promise<Stripe.Subscription> {
    if (atPeriodEnd) {
      return this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
    return this.stripe.subscriptions.cancel(subscriptionId);
  }

  // Ends a subscription now, after a withdrawal within 14 days: no credit
  // for the unused part (the refund pays it back) and no final invoice.
  // Ending one that has already ended is refused by the provider with an
  // invalid-request error.
  async endSubscriptionNow(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.cancel(subscriptionId, {
      prorate: false,
      invoice_now: false,
    });
  }

  // The newest paid invoice of a subscription: what was paid, in cents, the
  // service period it paid for, and the payment it was paid with. Null when
  // the subscription has no paid invoice.
  async latestPaidInvoice(
    subscriptionId: string,
  ): Promise<PaidSubscriptionInvoice | null> {
    const invoices = await this.stripe.invoices.list({
      subscription: subscriptionId,
      status: 'paid',
      limit: 1,
    });
    const invoice = invoices.data[0];
    if (!invoice) return null;

    // The period the invoice paid for is that of its charged lines; the
    // invoice's own period_start/period_end describe the period before it.
    const lines = invoice.lines.data.filter(
      (line) => line.amount > 0 && line.period.end > line.period.start,
    );
    const periodStart = lines.length
      ? Math.min(...lines.map((line) => line.period.start))
      : invoice.period_start;
    const periodEnd = lines.length
      ? Math.max(...lines.map((line) => line.period.end))
      : invoice.period_end;

    let paymentIntentId: string | null = null;
    let paidCents = invoice.amount_paid;
    if (invoice.amount_paid > 0) {
      const payments = await this.stripe.invoicePayments.list({
        invoice: invoice.id,
        status: 'paid',
      });
      const payment = payments.data.find((p) => p.payment.payment_intent);
      const intent = payment?.payment.payment_intent;
      paymentIntentId =
        (typeof intent === 'string' ? intent : intent?.id) ?? null;
      if (typeof payment?.amount_paid === 'number') {
        paidCents = Math.min(paidCents, payment.amount_paid);
      }
    }

    // Only a proration credit: the unused part of the earlier price.
    const creditCents = invoice.lines.data
      .filter(
        (line) =>
          line.amount < 0 &&
          (line.parent?.subscription_item_details?.proration === true ||
            line.parent?.invoice_item_details?.proration === true),
      )
      .reduce((sum, line) => sum - line.amount, 0);

    return {
      id: invoice.id,
      totalCents: invoice.total,
      amountPaidCents: invoice.amount_paid,
      paidCents,
      creditCents,
      currency: invoice.currency,
      periodStart: new Date(periodStart * 1000),
      periodEnd: new Date(periodEnd * 1000),
      paymentIntentId,
    };
  }

  // Refunds part of a subscription's payment to the card it came from. Never
  // more than what is left of that payment after the refunds that stand on
  // it. A refund already made for the same reason and subscription (by its
  // metadata) that still stands (succeeded, or pending on the bank) is
  // returned instead of refunding twice, so a retry refunds nothing more. A
  // failed or cancelled one gave nothing back: it is not counted, and the key
  // names how many failed, so the next try is a new refund rather than the
  // answer of the failed one. Null when there is nothing to refund.
  async refundSubscriptionPayment(params: {
    paymentIntentId: string;
    amountInCents: number;
    idempotencyKey: string;
    metadata: { reason: string; platformSubscriptionId: string };
  }): Promise<Stripe.Refund | null> {
    if (params.amountInCents <= 0) return null;

    const refunds: Stripe.Refund[] = [];
    for await (const refund of this.stripe.refunds.list({
      payment_intent: params.paymentIntentId,
      limit: 100,
    })) {
      refunds.push(refund);
    }
    const gaveNothing = (refund: Stripe.Refund) =>
      refund.status === 'failed' || refund.status === 'canceled';
    const ours = (refund: Stripe.Refund) =>
      refund.metadata?.reason === params.metadata.reason &&
      refund.metadata?.platformSubscriptionId ===
        params.metadata.platformSubscriptionId;
    const standing = refunds.filter((refund) => !gaveNothing(refund));
    const earlier = standing.find(ours);
    if (earlier) return earlier;
    const failedTries = refunds.filter(
      (refund) => gaveNothing(refund) && ours(refund),
    ).length;

    const payment = await this.stripe.paymentIntents.retrieve(
      params.paymentIntentId,
    );
    const alreadyRefunded = standing.reduce(
      (sum, refund) => sum + refund.amount,
      0,
    );
    const amount = Math.min(
      params.amountInCents,
      payment.amount_received - alreadyRefunded,
    );
    if (amount <= 0) return null;

    return this.stripe.refunds.create(
      {
        payment_intent: params.paymentIntentId,
        amount,
        reason: 'requested_by_customer',
        metadata: params.metadata,
      },
      { idempotencyKey: `${params.idempotencyKey}-${failedTries}` },
    );
  }

  // Voids the open invoices of a subscription, so none is collected after
  // it ended (a renewal that failed leaves one the provider keeps trying).
  // One already paid or voided meanwhile is left as it is.
  async voidOpenInvoices(subscriptionId: string): Promise<number> {
    const open: string[] = [];
    for await (const invoice of this.stripe.invoices.list({
      subscription: subscriptionId,
      status: 'open',
      limit: 100,
    })) {
      open.push(invoice.id);
    }
    let voided = 0;
    for (const id of open) {
      try {
        await this.stripe.invoices.voidInvoice(id);
        voided++;
      } catch (err) {
        if ((err as { type?: string })?.type !== 'StripeInvalidRequestError') {
          throw err;
        }
      }
    }
    return voided;
  }

  // Takes back a cancellation at the end of the period: the subscription
  // renews on its date again, and nothing is charged now.
  async resumeSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
  }

  // Moves a subscription to another price now (BD-016: monthly to yearly).
  // What is left of the period paid is credited, the new period starts
  // today and the difference is invoiced and charged at once. The change
  // applies only once that invoice is paid: while it is not, the
  // subscription keeps its price, `pending_update` is set, and the invoice
  // can be paid on its hosted page.
  async switchSubscriptionPrice(params: {
    subscriptionId: string;
    itemId: string;
    priceId: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(
      params.subscriptionId,
      {
        items: [{ id: params.itemId, price: params.priceId }],
        proration_behavior: 'always_invoice',
        billing_cycle_anchor: { type: 'now' },
        payment_behavior: 'pending_if_incomplete',
        metadata: params.metadata,
        expand: ['latest_invoice'],
      },
      { idempotencyKey: params.idempotencyKey },
    );
  }

  // The events of the platform created in a window that the provider has
  // not delivered to every destination yet.
  async listUndeliveredEvents(window: {
    from: Date;
    to: Date;
  }): Promise<{ id: string; type: string }[]> {
    const events = await this.stripe.events.list({
      delivery_success: false,
      created: {
        gte: Math.floor(window.from.getTime() / 1000),
        lte: Math.floor(window.to.getTime() / 1000),
      },
      limit: 100,
    });
    return events.data.map(({ id, type }) => ({ id, type }));
  }

  // Stripe Identity Methods

  // Create an Identity Verification Session.
  async createIdentityVerificationSession(
    userId: string,
    returnUrl: string,
  ): Promise<Stripe.Identity.VerificationSession> {
    return this.stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: {
        userId,
      },
      options: {
        document: {
          require_live_capture: true,
          require_matching_selfie: true,
        },
      },
      return_url: returnUrl,
    });
  }

  // Retrieve an Identity Verification Session.
  async getIdentityVerificationSession(
    sessionId: string,
  ): Promise<Stripe.Identity.VerificationSession> {
    // The date of birth only with a restricted key: the secret key is
    // refused when it asks for it.
    if (this.identityReader) {
      return this.identityReader.identity.verificationSessions.retrieve(
        sessionId,
        { expand: ['verified_outputs', 'verified_outputs.dob'] },
      );
    }
    return this.stripe.identity.verificationSessions.retrieve(sessionId, {
      expand: ['verified_outputs'],
    });
  }
}

// Whether the provider answered a request with an error (its response
// carries a status), as opposed to a request whose outcome is not known (the
// connection failed). An answered error is kept under its idempotency key,
// so the same request with the same key gets the same error again.
export function isProviderErrorResponse(error: unknown): boolean {
  const e = error as { type?: unknown; statusCode?: unknown } | null;
  return (
    typeof e?.statusCode === 'number' &&
    typeof e.type === 'string' &&
    e.type.startsWith('Stripe') &&
    e.type !== 'StripeConnectionError'
  );
}

export type StripeFailureClass = 'transient' | 'permanent';

// Classifies a Stripe SDK error by retryability. Nothing in this
// codebase previously distinguished a permanent failure (bad card, invalid
// request, bad API key -- will fail identically on retry) from a transient
// one (network blip, Stripe-side outage, rate limit -- worth retrying).
// Exported so callers can log/branch on it without duplicating the
// Stripe.errors class list. Note this classifies the SDK call itself;
// Stripe's own webhook redelivery + the reconciliation cron
// (reconcileStuckWebhookEvents) already provide retry for the webhook path
// independent of this.
export function classifyStripeError(error: unknown): StripeFailureClass {
  if (!(error instanceof Stripe.errors.StripeError)) {
    return 'transient'; // Network/timeout/unknown -- assume worth retrying.
  }
  if (
    error instanceof Stripe.errors.StripeConnectionError ||
    error instanceof Stripe.errors.StripeAPIError ||
    error instanceof Stripe.errors.StripeRateLimitError
  ) {
    return 'transient';
  }
  // StripeCardError, StripeInvalidRequestError, StripeAuthenticationError,
  // StripePermissionError, StripeIdempotencyError,
  // StripeSignatureVerificationError -- all indicate a request that will
  // fail the same way if simply retried unchanged.
  return 'permanent';
}
