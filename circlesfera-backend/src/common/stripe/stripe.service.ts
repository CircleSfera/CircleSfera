import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { CREATOR_PAYOUT_SCHEDULE } from '../constants/monetization.constants.js';
import { stripeWebhookSecrets } from './stripe-webhook-secrets.js';

// A Stripe Payment Method Configuration id (pmc_...).
const PAYMENT_METHOD_CONFIGURATION = /^pmc_[A-Za-z0-9]+$/;

// The provider's stable version, used for every request but one. The
// installed library is the provider's preview release, whose own version is
// the preview below; its documentation allows another version for the
// client, typed as its own.
const STRIPE_API_VERSION = '2026-10-28.endive';

// The provider's preview version, sent only to create a payout account: it
// lets an account with the Express Dashboard have the provider, not
// CircleSfera, liable for its negative balance.
const PAYOUT_ACCOUNT_API_VERSION: Stripe.LatestApiVersion =
  '2026-10-28.preview';

@Injectable()
export class StripeService implements OnModuleInit {
  public readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(@Inject(ConfigService) private configService: ConfigService) {
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
  // the methods enabled in the Dashboard. A payment to a creator is made on
  // the creator's account, where this configuration does not apply.
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
    return this.stripe.checkout.sessions.create(params, options);
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

  // Refunds a payment made on a creator's own account, in full unless an
  // amount is given. CircleSfera gives back its fee on what is refunded:
  // the sale did not happen.
  async refundCreatorPayment(params: {
    account: string;
    paymentIntentId: string;
    amountInCents?: number;
    idempotencyKey: string;
    metadata?: Stripe.MetadataParam;
  }): Promise<Stripe.Refund> {
    return this.stripe.refunds.create(
      {
        payment_intent: params.paymentIntentId,
        ...(params.amountInCents !== undefined && {
          amount: params.amountInCents,
        }),
        reason: 'requested_by_customer',
        refund_application_fee: true,
        metadata: params.metadata,
      },
      { stripeAccount: params.account, idempotencyKey: params.idempotencyKey },
    );
  }

  // Brings CircleSfera's fee on a payment made on a creator's account down
  // to what is due. The fee is asked when the checkout opens, before the
  // VAT is known; once it is, the part of the fee taken on the VAT goes back
  // to the creator. A payment's fee is lowered once, however often this is
  // asked.
  async settleCreatorPaymentFee(params: {
    account: string;
    paymentIntentId: string;
    feeDueCents: number;
  }): Promise<void> {
    const paymentIntent = await this.stripe.paymentIntents.retrieve(
      params.paymentIntentId,
      { expand: ['latest_charge'] },
      { stripeAccount: params.account },
    );
    const charge =
      paymentIntent.latest_charge &&
      typeof paymentIntent.latest_charge !== 'string'
        ? paymentIntent.latest_charge
        : null;
    const feeId =
      typeof charge?.application_fee === 'string'
        ? charge.application_fee
        : charge?.application_fee?.id;
    if (!feeId) {
      throw new Error(
        `Payment ${params.paymentIntentId} has no fee to settle on account ${params.account}`,
      );
    }
    const fee = await this.stripe.applicationFees.retrieve(feeId);
    const excess = fee.amount - fee.amount_refunded - params.feeDueCents;
    if (excess <= 0) {
      return;
    }
    await this.stripe.applicationFees.createRefund(
      feeId,
      { amount: excess, metadata: { reason: 'vat' } },
      { idempotencyKey: `fee-settle-${params.paymentIntentId}` },
    );
  }

  // Whether a creator's account can have the VAT of its sales calculated:
  // its tax settings (head office and at least one registration) are
  // complete. Until they are, its payments carry no VAT calculation.
  async creatorTaxActive(account: string): Promise<boolean> {
    const settings = await this.stripe.tax.settings.retrieve(
      {},
      { stripeAccount: account },
    );
    return settings.status === 'active';
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
  // Tries the platform destination first, then the Connect destination
  // (`STRIPE_CONNECT_WEBHOOK_SECRET`) — each Stripe destination has its own
  // `whsec_`.
  constructEvent(payload: Buffer, sig: string): any {
    const secrets = stripeWebhookSecrets({
      platform: this.configService.get<string>('STRIPE_WEBHOOK_SECRET'),
      connect: this.configService.get<string>('STRIPE_CONNECT_WEBHOOK_SECRET'),
    });
    if (secrets.length === 0) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    let lastError: unknown;
    for (const secret of secrets) {
      try {
        return this.stripe.webhooks.constructEvent(payload, sig, secret);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  // The customer a charge was made to, when it has one; a charge made on a
  // creator's account is read there.
  async getChargeCustomerId(
    chargeId: string,
    account?: string,
  ): Promise<string | undefined> {
    const { customer } = await this.stripe.charges.retrieve(
      chargeId,
      {},
      account ? { stripeAccount: account } : undefined,
    );
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

  // Stripe Connect Methods

  // Creates a creator's payout account: the creator is the seller of what
  // they sell and pays the provider's fees, and the provider, not
  // CircleSfera, is liable for its negative balance. With a key, a repeated
  // request answers the account the first one opened.
  async createExpressAccount(
    email: string,
    idempotencyKey?: string,
  ): Promise<Stripe.Account> {
    return this.stripe.accounts.create(
      {
        email,
        controller: {
          losses: { payments: 'stripe' },
          fees: { payer: 'account' },
          stripe_dashboard: { type: 'express' },
          requirement_collection: 'stripe',
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        settings: { payouts: { schedule: CREATOR_PAYOUT_SCHEDULE } },
      },
      {
        apiVersion: PAYOUT_ACCOUNT_API_VERSION,
        ...(idempotencyKey && { idempotencyKey }),
      },
    );
  }

  // The events of the platform, or of one connected account, created in a
  // window that the provider has not delivered to every destination yet.
  async listUndeliveredEvents(
    window: { from: Date; to: Date },
    stripeAccount?: string,
  ): Promise<{ id: string; type: string }[]> {
    const events = await this.stripe.events.list(
      {
        delivery_success: false,
        created: {
          gte: Math.floor(window.from.getTime() / 1000),
          lte: Math.floor(window.to.getTime() / 1000),
        },
        limit: 100,
      },
      stripeAccount ? { stripeAccount } : undefined,
    );
    return events.data.map(({ id, type }) => ({ id, type }));
  }

  // Holds or resumes the payouts of a creator's account. Held, what it earns
  // stays in its balance until the payouts are resumed, on Mondays again.
  async setPayoutsHeld(accountId: string, held: boolean): Promise<void> {
    await this.stripe.accounts.update(accountId, {
      settings: {
        payouts: {
          schedule: held ? { interval: 'manual' } : CREATOR_PAYOUT_SCHEDULE,
        },
      },
    });
  }

  // Retrieve a Stripe Account by ID.
  async getAccount(accountId: string): Promise<Stripe.Account> {
    return this.stripe.accounts.retrieve(accountId);
  }

  // Create an Account Link for onboarding.
  async createAccountLink(
    accountId: string,
    returnUrl: string,
    refreshUrl: string,
  ): Promise<Stripe.AccountLink> {
    return this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
  }

  // Create a login link for the connected Express account.
  async createLoginLink(accountId: string): Promise<Stripe.LoginLink> {
    return this.stripe.accounts.createLoginLink(accountId);
  }

  // A session for the provider's panels embedded in the app, on a creator's
  // own account: only its tax settings and its tax registrations. Answers
  // the session's secret, which is never logged.
  async createTaxDetailsSession(accountId: string): Promise<string> {
    const session = await this.stripe.accountSessions.create({
      account: accountId,
      components: {
        tax_settings: { enabled: true },
        tax_registrations: { enabled: true },
      },
    });
    return session.client_secret;
  }

  // What a creator's own account holds of its tax details: where it is
  // based (city and country only), whether Stripe can work out taxes with
  // it, and the countries where it is registered for VAT now.
  async getTaxDetailsStatus(accountId: string): Promise<{
    headOffice: { city: string | null; country: string | null } | null;
    status: 'active' | 'pending';
    registrationCountries: string[];
  }> {
    const options = { stripeAccount: accountId };
    const settings = await this.stripe.tax.settings.retrieve({}, options);
    const registrations = await this.stripe.tax.registrations.list(
      { status: 'active', limit: 100 },
      options,
    );
    const address = settings.head_office?.address;
    return {
      headOffice: address
        ? { city: address.city ?? null, country: address.country ?? null }
        : null,
      status: settings.status === 'active' ? 'active' : 'pending',
      registrationCountries: [
        ...new Set(registrations.data.map((entry) => entry.country)),
      ],
    };
  }

  // The publishable key the embedded panels load with, when it is set and
  // of the same mode (test or live) as the secret key; else none.
  embeddedPanelsPublishableKey(): string | null {
    const publishable =
      this.configService.get<string>('STRIPE_PUBLISHABLE_KEY') ?? '';
    const secret = this.configService.get<string>('STRIPE_SECRET_KEY') ?? '';
    const publishableMode = /^pk_(test|live)_\w+$/.exec(publishable)?.[1];
    const secretMode = /^(?:sk|rk)_(test|live)_/.exec(secret)?.[1];
    return publishableMode && publishableMode === secretMode
      ? publishable
      : null;
  }

  // Read-only Connect balance (available + pending) for a connected account.
  async getConnectBalance(accountId: string): Promise<Stripe.Balance> {
    return this.stripe.balance.retrieve({}, { stripeAccount: accountId });
  }

  // Recent payouts for a connected Express account (read-only).
  async listConnectPayouts(
    accountId: string,
    limit = 10,
  ): Promise<Stripe.ApiList<Stripe.Payout>> {
    return this.stripe.payouts.list({ limit }, { stripeAccount: accountId });
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

// What of a Connect account tells whether it is a verified company.
export interface ConnectAccountCompanyFields {
  business_type?: string | null;
  details_submitted?: boolean | null;
  capabilities?: { transfers?: string | null } | null;
  requirements?: {
    currently_due?: string[] | null;
    disabled_reason?: string | null;
  } | null;
}

// A payout account counts as a verified company when its holder is a company
// and the provider has nothing left to ask: details submitted, transfers
// active, nothing due and not disabled. An account of a person never counts.
export function isVerifiedCompanyAccount(
  account: ConnectAccountCompanyFields,
): boolean {
  return (
    account.business_type === 'company' &&
    account.details_submitted === true &&
    account.capabilities?.transfers === 'active' &&
    !account.requirements?.disabled_reason &&
    (account.requirements?.currently_due?.length ?? 0) === 0
  );
}

export interface ConnectAccountCapabilityFlags {
  transfersEnabled: boolean;
  chargesEnabled: boolean;
}

// Single source of truth for reading Connect account eligibility off a
// Stripe Account (or the narrower `account.updated` webhook payload) —
// previously reimplemented identically in monetization.service.ts's
// on-demand getAccountStatus poll and payments.service.ts's passive
// account.updated webhook handler.
// A sale is charged on the creator's own account, so it takes payments only
// once card payments are active on it, not only charges.
export function deriveConnectAccountFlags(account: {
  charges_enabled?: boolean | null;
  capabilities?: {
    transfers?: string | null;
    card_payments?: string | null;
  } | null;
}): ConnectAccountCapabilityFlags {
  return {
    transfersEnabled: account.capabilities?.transfers === 'active',
    chargesEnabled:
      account.charges_enabled === true &&
      account.capabilities?.card_payments === 'active',
  };
}

// An account opened before creators sold on their own account: it never
// asked to take card payments and can only receive transfers. An account
// opened since asks for them, so it has the capability while it is still
// being verified.
export function isTransferOnlyAccount(account: {
  capabilities?: { card_payments?: string | null } | null;
}): boolean {
  return !account.capabilities?.card_payments;
}
