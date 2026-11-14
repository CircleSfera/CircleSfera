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
import { SYSTEM_SETTING_KEYS } from '../../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../../system-settings/system-settings.service.js';
import { AppException } from '../errors/app.exception.js';
import { usableWebhookSecret } from './stripe-webhook-secrets.js';

// A Stripe Payment Method Configuration id (pmc_...).
const PAYMENT_METHOD_CONFIGURATION = /^pmc_[A-Za-z0-9]+$/;

// The provider's stable version, used for every request but one. The
// installed library is the provider's preview release, whose own version is
// the preview below; its documentation allows another version for the
// client, typed as its own.
const STRIPE_API_VERSION = '2026-10-28.endive';

@Injectable()
export class StripeService implements OnModuleInit {
  public readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    // Read on every new checkout: staff can pause new payments.
    @Optional()
    @Inject(SystemSettingsService)
    private readonly systemSettings?: SystemSettingsService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY') || '';
    this.stripe = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
      timeout: 20_000,
      maxNetworkRetries: 2,
    });
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

  // Takes back a cancellation at the end of the period: the subscription
  // renews on its date again, and nothing is charged now.
  async resumeSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
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
    return this.stripe.identity.verificationSessions.retrieve(sessionId, {
      expand: ['verified_outputs'],
    });
  }
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
