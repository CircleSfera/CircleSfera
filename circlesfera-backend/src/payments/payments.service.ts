import { ErrorCode, type PaymentAlertEvent } from '@circlesfera/shared';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountType, SubscriptionStatus } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type Stripe from 'stripe';
import { withdrawalConsentMetadata } from '../common/consumer/withdrawal-consent.js';
import { AppException } from '../common/errors/app.exception.js';
import { assertRealMoneyAllowed } from '../common/policies/test-account.policy.js';
import {
  type ConnectAccountCompanyFields,
  classifyStripeError,
  StripeService,
} from '../common/stripe/stripe.service.js';
import {
  type SubscriptionWithItems,
  subscriptionPeriod,
} from '../common/stripe/subscription-period.js';
import { EmailService } from '../email/email.service.js';
import {
  isMonetizationCheckoutType,
  MonetizationWebhookService,
  type StripeDisputePayload,
  type StripeRefundedCharge,
} from '../monetization/monetization-webhook.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';

export const WEBHOOK_LEASE_DURATION_MS = 2 * 60 * 1000; // 2 minutes lease duration

// The type of Profile a plan is meant for, from its name; Premium, and any
// plan that names none, is for every Profile.
export function planAccountType(
  planName: string | null | undefined,
): AccountType | null {
  const name = (planName ?? '').toLowerCase();
  if (name.includes('business')) return AccountType.BUSINESS;
  if (name.includes('elite')) return AccountType.CREATOR;
  return null;
}

// An amount kept in cents, written in euros with two decimals.
function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Text for a cell of a spreadsheet. A cell that starts like a formula is
// written as text, so a spreadsheet shows it instead of running it.
function csvText(value: string | null | undefined): string {
  const text = value ?? '';
  return /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly checkoutInFlight = new Map<
    string,
    Promise<Stripe.Checkout.Session>
  >();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeService) private readonly stripeService: StripeService,
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(MonetizationWebhookService)
    private readonly monetizationWebhookService: MonetizationWebhookService,
    private readonly eventEmitter: EventEmitter2,
    @Optional()
    @Inject(ConfigService)
    private readonly configService?: ConfigService,
  ) {}

  private get frontendUrl(): string {
    return (
      this.configService?.get<string>('FRONTEND_URL') || 'http://localhost:5173'
    );
  }

  // Map Stripe status to our SubscriptionStatus enum.
  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    const status = stripeStatus.toLowerCase();
    switch (status) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'past_due':
      case 'unpaid':
        return SubscriptionStatus.PAST_DUE;
      case 'incomplete':
        return SubscriptionStatus.INCOMPLETE;
      case 'incomplete_expired':
        return SubscriptionStatus.EXPIRED;
      case 'canceled':
        return SubscriptionStatus.CANCELLED;
      default:
        // Unknown Stripe status must not grant entitlements
        return SubscriptionStatus.PAST_DUE;
    }
  }

  // The record of money a person sent and received, or of every
  // transaction for staff. A person's own record never names the other
  // party: a transaction is between accounts, and naming one could tell
  // which Profile is behind it. Amounts are in euros, not cents.
  async getLedgerCsv(userId?: string): Promise<string> {
    const transactions = await this.prisma.transaction.findMany({
      where: userId
        ? {
            OR: [{ senderId: userId }, { receiverId: userId }],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      ...(userId
        ? {}
        : {
            include: {
              sender: { select: { email: true } },
              receiver: { select: { email: true } },
            },
          }),
    });

    const header = userId
      ? 'ID,Date,Type,Direction,Amount,VAT,Refunded,Currency,Status,Description\n'
      : 'ID,Date,Type,Amount,VAT,Refunded,Currency,Status,Sender,Receiver,Description\n';
    const rows = transactions
      .map((tx) => {
        const parties = tx as typeof tx & {
          sender?: { email: string } | null;
          receiver?: { email: string } | null;
        };
        const common = [tx.id, tx.createdAt.toISOString(), tx.type];
        // The amount is what was paid; the VAT is the part of it that is VAT,
        // and refunded what the buyer got back of it.
        const money = [
          centsToEuros(tx.amount),
          centsToEuros(tx.vatCents),
          centsToEuros(tx.refundedCents),
          tx.currency,
          tx.status,
        ];
        const cells = userId
          ? [
              ...common,
              tx.senderId === userId ? 'SENT' : 'RECEIVED',
              ...money,
              csvText(tx.description),
            ]
          : [
              ...common,
              ...money,
              csvText(parties.sender?.email || 'SYSTEM'),
              csvText(parties.receiver?.email || 'SYSTEM'),
              csvText(tx.description),
            ];
        return cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',');
      })
      .join('\n');

    return header + rows;
  }

  async findAllPlans() {
    return this.prisma.platformPlan.findMany({
      where: { isActive: true },
      orderBy: { priceCents: 'asc' },
    });
  }

  async createCheckout(
    userId: string,
    planId: string,
    billingCycle: 'MONTHLY' | 'YEARLY' = 'MONTHLY',
    profileId?: string,
  ): Promise<Stripe.Checkout.Session | { url: string }> {
    await assertRealMoneyAllowed(this.prisma, userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { platformSubscriptions: true },
    });

    if (!user)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    // A plan belongs to one Profile: the one in use, which must be one of
    // the person's.
    const profile = profileId
      ? await this.prisma.profile.findFirst({
          where: { id: profileId, userId },
          select: { id: true, accountType: true },
        })
      : null;
    if (!profile) {
      throw AppException.NotFound(
        ErrorCode.PROFILE_NOT_FOUND,
        'Profile not found',
      );
    }

    const plan = await this.prisma.platformPlan.findFirst({
      where: {
        // A plan taken off sale cannot be bought, whoever names its id.
        isActive: true,
        OR: [{ id: planId }, { stripeProductId: planId }],
      },
    });

    if (!plan)
      throw AppException.NotFound(ErrorCode.PLAN_NOT_FOUND, 'Plan not found');

    const activeStatuses: SubscriptionStatus[] = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
    ];
    // Each plan is for one type of Profile; Premium is for any.
    const requiredType = planAccountType(plan.name);
    if (requiredType && profile.accountType !== requiredType) {
      throw AppException.BadRequest(
        ErrorCode.PLAN_NOT_FOR_PROFILE_TYPE,
        `This plan is for ${requiredType.toLowerCase()} profiles.`,
        { requiredAccountType: requiredType },
      );
    }

    // One active plan per Profile; the person's other Profiles do not count.
    const activeSubs = user.platformSubscriptions.filter(
      (s) => s.profileId === profile.id && activeStatuses.includes(s.status),
    );

    if (activeSubs.some((s) => s.planId === plan.id)) {
      throw AppException.BadRequest(
        ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
        'You already have an active subscription to this plan. Manage it in the billing portal.',
      );
    }

    if (activeSubs.length > 0) {
      throw AppException.Conflict(
        ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
        'This profile already has an active platform plan. Cancel or change it via the billing portal before starting another.',
      );
    }

    const stripePriceId =
      billingCycle === 'YEARLY' ? plan.yearlyStripePriceId : plan.stripePriceId;

    if (!stripePriceId) {
      throw new Error(
        `Billing cycle ${billingCycle} is not available for this plan`,
      );
    }

    const intentKey = `${userId}:${profile.id}:${plan.id}:${billingCycle}`;
    const inFlight = this.checkoutInFlight.get(intentKey);
    if (inFlight) {
      return inFlight;
    }

    const checkoutPromise = (async () => {
      try {
        const customerId = await this.ensureStripeCustomer(user);

        return await this.stripeService.createCheckoutSession(
          {
            customer: customerId,
            line_items: [{ price: stripePriceId, quantity: 1 }],
            mode: 'subscription',
            // Plan prices include VAT: the provider works out the VAT inside
            // the price for where the buyer is, from the billing address it
            // asks for, and saves that address on the customer for the
            // renewals.
            automatic_tax: { enabled: true },
            billing_address_collection: 'required',
            customer_update: { address: 'auto', name: 'auto' },
            success_url: `${this.frontendUrl}/accounts/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${this.frontendUrl}/accounts/billing?success=false`,
            metadata: {
              userId,
              planId: plan.id,
              billingCycle,
              profileId: profile.id,
              ...withdrawalConsentMetadata(),
            },
          },
          {
            // A new prefix: a key reused with other parameters is refused.
            idempotencyKey: `checkout_sub_tax_${intentKey}`,
          },
        );
      } catch (err) {
        this.logger.error(
          `Stripe checkout session creation failed for ${intentKey} (${classifyStripeError(err)}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        throw err;
      } finally {
        this.checkoutInFlight.delete(intentKey);
      }
    })();

    this.checkoutInFlight.set(intentKey, checkoutPromise);
    return checkoutPromise;
  }

  /**
   * Ensures the user has a canonical Stripe customer ID idempotently and concurrency-safely.
   * Uses Stripe idempotency keys to guarantee only one customer is ever created in Stripe for a user.
   * Uses atomic database updates to resolve any race conditions locally.
   */
  async ensureStripeCustomer(user: {
    id: string;
    email: string;
    stripeCustomerId?: string | null;
  }): Promise<string> {
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    // Check database to ensure fresh state under concurrency
    const freshUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, stripeCustomerId: true },
    });
    if (freshUser?.stripeCustomerId) {
      return freshUser.stripeCustomerId;
    }

    // Idempotent customer creation in Stripe keyed by userId
    const customer = await this.stripeService.createCustomer(
      freshUser?.email || user.email,
      undefined,
      { idempotencyKey: `stripe_cust_${user.id}` },
    );

    if (!customer?.id) {
      throw AppException.BadRequest(
        ErrorCode.STRIPE_CUSTOMER_MISSING,
        'Stripe customer creation failed',
      );
    }

    // Atomic update only if stripeCustomerId is still null
    const updateResult = await this.prisma.user.updateMany({
      where: { id: user.id, stripeCustomerId: null },
      data: { stripeCustomerId: customer.id },
    });

    if (updateResult.count === 0) {
      // Another concurrent process won the local update race; read canonical value
      const canonicalUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { stripeCustomerId: true },
      });
      if (canonicalUser?.stripeCustomerId) {
        return canonicalUser.stripeCustomerId;
      }
    }

    return customer.id;
  }

  // The plan of the Profile in use, and which other Profiles of the person
  // have one: the person pays for all of them.
  async getBillingStatus(userId: string, profileId: string) {
    const subscription = await this.prisma.platformSubscription.findFirst({
      where: {
        userId,
        // Without a Profile the session has no plan: never another one's.
        profileId: profileId || '__no_profile__',
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.PAST_DUE,
          ],
        },
      },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            priceCents: true,
            currency: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      hasActiveSubscription:
        !!subscription &&
        (subscription.status === SubscriptionStatus.ACTIVE ||
          subscription.status === SubscriptionStatus.TRIALING),
      subscription: subscription
        ? {
            id: subscription.id,
            planId: subscription.planId,
            planName: subscription.plan.name,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            priceCents: subscription.plan.priceCents,
            currency: subscription.plan.currency,
          }
        : null,
      otherProfiles: await this.plansOfOtherProfiles(userId, profileId),
    };
  }

  // Cancels the plan of the Profile in use at the end of the period paid:
  // its features stay until then and nothing more is charged. Only the
  // person who pays it can cancel it. Cancelling again changes nothing.
  async cancelPlan(userId: string, profileId: string) {
    const subscription = await this.prisma.platformSubscription.findFirst({
      where: {
        userId,
        profileId: profileId || '__no_profile__',
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.PAST_DUE,
          ],
        },
      },
      include: {
        plan: { select: { name: true } },
        profile: { select: { username: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!subscription) {
      throw AppException.NotFound(
        ErrorCode.SUBSCRIPTION_NOT_FOUND,
        'This profile has no plan to cancel',
      );
    }

    if (!subscription.cancelAtPeriodEnd) {
      await this.stripeService.cancelSubscription(
        subscription.stripeSubscriptionId,
        true,
      );
      await this.prisma.platformSubscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true },
      });

      // Telling the payer is best effort: the cancellation already stands.
      try {
        const payer = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        if (payer?.email) {
          await this.emailService.sendPlanCancelledEmail(
            payer.email,
            subscription.plan.name,
            subscription.profile?.username ?? '',
            subscription.currentPeriodEnd,
          );
        }
      } catch (err) {
        this.logger.error('Failed to send the plan cancelled email', err);
      }
    }

    return this.getBillingStatus(userId, profileId);
  }

  private async plansOfOtherProfiles(userId: string, profileId: string) {
    const others = await this.prisma.platformSubscription.findMany({
      where: {
        userId,
        profileId: { not: profileId || '__no_profile__' },
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        status: true,
        plan: { select: { name: true } },
        profile: { select: { id: true, username: true } },
      },
    });
    return others
      .filter((other) => other.profile)
      .map((other) => ({
        profileId: other.profile!.id,
        username: other.profile!.username,
        planName: other.plan.name,
        status: other.status,
      }));
  }

  private async profileOfCheckout(
    userId: string,
    named?: string | null,
  ): Promise<string | null> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId, ...(named && { id: named }) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  // Heal races: on one Profile, keep only the newly activated plan as
  // ACTIVE. The plans of the person's other Profiles are left alone.
  private async enforceSingleActivePlatformPlan(
    profileId: string,
    keepStripeSubscriptionId: string,
  ) {
    const others = await this.prisma.platformSubscription.findMany({
      where: {
        profileId,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
        NOT: { stripeSubscriptionId: keepStripeSubscriptionId },
      },
    });

    for (const other of others) {
      let stripeCancelled = true;

      if (other.stripeSubscriptionId) {
        try {
          await this.stripeService.cancelSubscription(
            other.stripeSubscriptionId,
            false,
          );
        } catch (err) {
          this.logger.error(
            `Failed to cancel Stripe sub ${other.stripeSubscriptionId}`,
            err,
          );
          stripeCancelled = false;
        }
      }

      if (stripeCancelled) {
        await this.prisma.platformSubscription.update({
          where: { id: other.id },
          data: {
            status: SubscriptionStatus.CANCELLED,
            cancelAtPeriodEnd: false,
          },
        });
      }
    }
  }

  async getPortalUrl(
    userId: string,
  ): Promise<Stripe.BillingPortal.Session | { url: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');
    }

    const customerId = await this.ensureStripeCustomer(user);

    return this.stripeService.createPortalSession(
      customerId,
      `${this.frontendUrl}/accounts/billing`,
    );
  }

  // Proxies signature verification to StripeService.
  constructEvent(payload: Buffer, sig: string) {
    return this.stripeService.constructEvent(payload, sig);
  }

  // Main processor for incoming Stripe webhook events.
  // Idempotent: PROCESSED events are skipped; PENDING/FAILED are reprocessed.
  // On handler failure marks FAILED and rethrows (controller returns 5xx).
  // Includes lease-based crash recovery and duplicate delivery protection.
  async processWebhookEvent(event: Stripe.Event) {
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { externalId: event.id },
    });

    if (existing?.status === 'PROCESSED') {
      return;
    }

    const now = new Date();
    const leaseCutoff = new Date(now.getTime() - WEBHOOK_LEASE_DURATION_MS);

    if (!existing) {
      try {
        await this.prisma.webhookEvent.create({
          data: {
            provider: 'stripe',
            externalId: event.id,
            payload: event as unknown as object,
            status: 'PENDING',
          },
        });
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          const raced = await this.prisma.webhookEvent.findUnique({
            where: { externalId: event.id },
          });
          if (!raced || raced.status === 'PROCESSED') {
            return;
          }
          if (raced.status === 'PENDING') {
            if (raced.updatedAt > leaseCutoff) {
              return; // Actively held lease
            }
            const { count } = await this.prisma.webhookEvent.updateMany({
              where: {
                externalId: event.id,
                status: 'PENDING',
                updatedAt: { lte: leaseCutoff },
              },
              data: { updatedAt: now },
            });
            if (count === 0) return;
          } else if (raced.status === 'FAILED') {
            const { count } = await this.prisma.webhookEvent.updateMany({
              where: { externalId: event.id, status: 'FAILED' },
              data: { status: 'PENDING', updatedAt: now },
            });
            if (count === 0) return;
          }
        } else {
          throw err;
        }
      }
    } else if (existing.status === 'FAILED') {
      const { count } = await this.prisma.webhookEvent.updateMany({
        where: { externalId: event.id, status: 'FAILED' },
        data: { status: 'PENDING', updatedAt: now },
      });
      if (count === 0) return;
    } else if (existing.status === 'PENDING') {
      // Lease check:
      // If lease is still active, another worker is actively processing it.
      if (existing.updatedAt > leaseCutoff) {
        this.logger.debug(
          `Webhook event ${event.id} is actively being processed (lease active).`,
        );
        return;
      }

      // If lease expired, the previous worker crashed. Atomically claim the expired lease.
      const { count } = await this.prisma.webhookEvent.updateMany({
        where: {
          externalId: event.id,
          status: 'PENDING',
          updatedAt: { lte: leaseCutoff },
        },
        data: { updatedAt: now },
      });
      if (count === 0) {
        return; // Another worker claimed it or state changed
      }
      this.logger.warn(
        `Recovered stuck PENDING webhook event ${event.id} (lease expired, claimed for retry).`,
      );
    }

    try {
      await this.dispatchStripeEvent(event);
      await this.prisma.webhookEvent.update({
        where: { externalId: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (err: any) {
      this.logger.error(
        `Webhook event ${event.id} (${event.type}) dispatch failed (${classifyStripeError(err)}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.prisma.webhookEvent
        .update({
          where: { externalId: event.id },
          data: { status: 'FAILED' },
        })
        .catch(() => undefined);
      throw err;
    }
  }

  /**
   * Periodic reconciliation job:
   * Recovers and processes stuck PENDING webhook events whose lease has expired.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileStuckWebhookEvents(limit = 25): Promise<number> {
    const leaseCutoff = new Date(Date.now() - WEBHOOK_LEASE_DURATION_MS);

    const stuckEvents = await this.prisma.webhookEvent.findMany({
      where: {
        status: 'PENDING',
        updatedAt: { lte: leaseCutoff },
      },
      take: limit,
      orderBy: { updatedAt: 'asc' },
    });

    if (stuckEvents.length === 0) {
      return 0;
    }

    this.logger.log(
      `Found ${stuckEvents.length} stuck PENDING webhook events. Starting reconciliation...`,
    );

    let recoveredCount = 0;

    for (const webhook of stuckEvents) {
      // Atomically claim the expired lease
      const now = new Date();
      const { count } = await this.prisma.webhookEvent.updateMany({
        where: {
          id: webhook.id,
          status: 'PENDING',
          updatedAt: { lte: leaseCutoff },
        },
        data: { updatedAt: now },
      });

      if (count === 0) {
        continue; // Claimed by another worker
      }

      try {
        await this.dispatchStripeEvent(
          webhook.payload as unknown as Stripe.Event,
        );
        await this.prisma.webhookEvent.update({
          where: { id: webhook.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
        recoveredCount++;
        this.logger.log(
          `Reconciled and processed stuck webhook event ${webhook.externalId}`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to reconcile webhook event ${webhook.externalId}: ${err?.message || err}`,
        );
        await this.prisma.webhookEvent
          .update({
            where: { id: webhook.id },
            data: { status: 'FAILED' },
          })
          .catch(() => undefined);
      }
    }

    return recoveredCount;
  }

  // Mirrors a dispute. Who was charged is read from the provider only when
  // the dispute cannot be tied to an account otherwise; a provider that does
  // not answer never loses the dispute.
  private async syncDispute(dispute: StripeDisputePayload) {
    const chargeId =
      typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
    await this.monetizationWebhookService.syncDispute(dispute, async () => {
      if (!chargeId) return undefined;
      try {
        return await this.stripeService.getChargeCustomerId(chargeId);
      } catch {
        this.logger.warn(
          `The customer of the charge of dispute ${dispute.id} could not be read`,
        );
        return undefined;
      }
    });
  }

  private async dispatchStripeEvent(event: Stripe.Event) {
    const { type, data } = event;

    this.logger.log(`Processing Stripe webhook event: ${type}`);

    switch (type) {
      case 'checkout.session.completed': {
        const session = data.object;
        const metadata = session.metadata;
        const paymentStatus = session.payment_status as string | undefined;

        // One-time payments must be paid; subscriptions may be unpaid only in edge trial cases
        if (
          session.mode === 'payment' &&
          paymentStatus &&
          paymentStatus !== 'paid'
        ) {
          throw new Error(
            `Checkout session ${session.id} not paid (status=${paymentStatus})`,
          );
        }

        // Creator monetization (post/story/message unlocks, tips, live
        // gifts, promotions) is fulfilled by MonetizationWebhookService —
        // an independent application boundary from platform subscription
        // billing below. Both share this webhook's signature
        // verification and WebhookEvent idempotency bookkeeping.
        if (isMonetizationCheckoutType(metadata?.type)) {
          await this.monetizationWebhookService.handleCheckoutSessionCompleted(
            session,
          );
        } else {
          // Handle Subscriptions (Existing logic)
          const userId = metadata?.userId;
          const planId = metadata?.planId;
          const stripeSubscriptionId = session.subscription as string;

          if (!userId || !planId || !stripeSubscriptionId) {
            this.logger.warn(
              'Checkout session completed but missing metadata or subscription ID',
            );
            return;
          }

          // The Profile the plan was bought for. A checkout started before
          // plans were per Profile names none: it goes to the oldest Profile
          // of the person. One named must be the person's own.
          const profileId = await this.profileOfCheckout(
            userId,
            metadata?.profileId,
          );
          if (!profileId) {
            this.logger.warn(
              `Checkout session completed for user ${userId} without a Profile to give the plan to`,
            );
            return;
          }

          const subscriptionRaw =
            await this.stripeService.getSubscription(stripeSubscriptionId);
          const stripeSubscription = subscriptionRaw as unknown as {
            status: string;
            cancel_at_period_end: boolean;
          } & SubscriptionWithItems;
          const period = subscriptionPeriod(stripeSubscription);

          // The plan being recorded is the one that stays. Any older plan of
          // this Profile is cancelled first, so the Profile never holds two,
          // which the database would refuse.
          await this.enforceSingleActivePlatformPlan(
            profileId,
            stripeSubscriptionId,
          );

          await this.prisma.platformSubscription.upsert({
            where: { stripeSubscriptionId },
            update: {
              status: this.mapStripeStatus(stripeSubscription.status),
              currentPeriodStart: period.start,
              currentPeriodEnd: period.end,
              cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
              profileId,
            },
            create: {
              userId,
              planId,
              profileId,
              status: this.mapStripeStatus(stripeSubscription.status),
              stripeSubscriptionId: stripeSubscriptionId,
              currentPeriodStart: period.start,
              currentPeriodEnd: period.end,
              cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
            },
          });

          // Phase 3: Elevate account type and verification level based on plan
          const plan = await this.prisma.platformPlan.findUnique({
            where: { id: planId },
          });

          if (plan) {
            await this.usersService.syncUserTier(userId);
          }

          this.logger.log(
            `Successfully processed checkout for user ${userId}, plan ${planId}`,
          );

          if (plan) {
            const user = await this.prisma.user.findUnique({
              where: { id: userId },
              select: { email: true },
            });
            if (user) {
              const formattedAmount = new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: session.currency?.toUpperCase() || 'EUR',
              }).format((session.amount_total || 0) / 100);
              this.emailService
                .sendSubscriptionReceipt(user.email, plan.name, formattedAmount)
                .catch((e) => this.logger.error(e));
            }
          }

          const alertEvent: PaymentAlertEvent['payload'] = {
            eventType: 'Platform Subscription Checkout',
            amount: session.amount_total || 0,
            currency: session.currency || 'eur',
            description: `User ${userId} subscribed to plan ${planId}`,
            userId: userId,
          };
          this.eventEmitter.emit('payment.alert', alertEvent);
        }

        break;
      }

      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        // Cast via unknown to a specific shape to satisfy the linter
        const subscription = data.object as unknown as {
          id: string;
          status: string;
          cancel_at_period_end: boolean;
        } & SubscriptionWithItems;
        const period = subscriptionPeriod(subscription);

        await this.prisma.platformSubscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: this.mapStripeStatus(subscription.status),
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
        });

        // VIP Subscriptions are removed

        // Sync user tier if this was a platform subscription
        const platformSub = await this.prisma.platformSubscription.findFirst({
          where: { stripeSubscriptionId: subscription.id },
          select: { userId: true },
        });
        if (platformSub?.userId) {
          await this.usersService.syncUserTier(platformSub.userId);
        }

        break;
      }

      case 'identity.verification_session.verified':
      case 'identity.verification_session.canceled':
      case 'identity.verification_session.requires_input': {
        const session = data.object as Stripe.Identity.VerificationSession;
        await this.usersService.handleIdentityWebhook(session);
        break;
      }

      case 'checkout.session.expired': {
        await this.monetizationWebhookService.handleCheckoutSessionExpired(
          data.object,
        );
        break;
      }

      case 'invoice.payment_failed': {
        // The subscription of an invoice is named under its parent.
        const invoice = data.object as {
          parent?: {
            subscription_details?: {
              subscription?: string | { id: string } | null;
            } | null;
          } | null;
        };
        const named = invoice.parent?.subscription_details?.subscription;
        const subscriptionId = typeof named === 'string' ? named : named?.id;
        if (subscriptionId) {
          await this.prisma.platformSubscription.updateMany({
            where: { stripeSubscriptionId: subscriptionId },
            data: { status: SubscriptionStatus.PAST_DUE },
          });
          const platformSub = await this.prisma.platformSubscription.findFirst({
            where: { stripeSubscriptionId: subscriptionId },
            select: { userId: true },
          });
          if (platformSub?.userId) {
            await this.usersService.syncUserTier(platformSub.userId);
          }
        }
        break;
      }

      case 'charge.refunded': {
        await this.monetizationWebhookService.handleChargeRefunded(
          data.object as StripeRefundedCharge,
        );
        break;
      }

      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed': {
        const dispute = data.object as StripeDisputePayload;
        await this.syncDispute(dispute);
        await this.monetizationWebhookService.applyDisputeToPayment(dispute);
        break;
      }

      case 'payout.created':
      case 'payout.updated':
      case 'payout.paid':
      case 'payout.failed':
      case 'payout.canceled': {
        await this.monetizationWebhookService.syncConnectPayoutLog(event);
        break;
      }

      case 'account.updated': {
        await this.monetizationWebhookService.handleAccountUpdated(
          data.object as {
            id: string;
            charges_enabled?: boolean;
            capabilities?: { transfers?: string };
          } & ConnectAccountCompanyFields,
        );
        break;
      }

      default:
        this.logger.warn(`Unhandled Stripe event type: ${type}`);
        Sentry.captureMessage(`Unhandled Stripe event: ${type}`, 'warning');
    }
  }
}
