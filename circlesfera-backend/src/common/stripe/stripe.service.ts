import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { stripeWebhookSecrets } from './stripe-webhook-secrets.js';

// Keep in sync with the installed `stripe` package's LatestApiVersion.
const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2026-08-26.dahlia';

@Injectable()
export class StripeService implements OnModuleInit {
  public readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(@Inject(ConfigService) private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY') || '';
    this.stripe = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
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

    if (!secretKey || secretKey.includes('dummy')) {
      this.logger.warn(
        'Stripe is running in SIMULATOR mode — no real charges will be processed.',
      );
    }
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

  // Create an Express connected account for a creator.
  async createExpressAccount(email: string): Promise<Stripe.Account> {
    return this.stripe.accounts.create({
      type: 'express',
      email: email,
      capabilities: {
        transfers: { requested: true },
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

export interface ConnectAccountCapabilityFlags {
  transfersEnabled: boolean;
  chargesEnabled: boolean;
}

// Single source of truth for reading Connect account eligibility off a
// Stripe Account (or the narrower `account.updated` webhook payload) —
// previously reimplemented identically in monetization.service.ts's
// on-demand getAccountStatus poll and payments.service.ts's passive
// account.updated webhook handler.
export function deriveConnectAccountFlags(account: {
  charges_enabled?: boolean | null;
  capabilities?: { transfers?: string | null } | null;
}): ConnectAccountCapabilityFlags {
  return {
    transfersEnabled: account.capabilities?.transfers === 'active',
    chargesEnabled: account.charges_enabled === true,
  };
}
