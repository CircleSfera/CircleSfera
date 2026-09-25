import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionStatus } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type Stripe from 'stripe';
import { AppException } from '../common/errors/app.exception.js';
import {
  classifyStripeError,
  StripeService,
} from '../common/stripe/stripe.service.js';
import { EmailService } from '../email/email.service.js';
import {
  isMonetizationCheckoutType,
  MonetizationWebhookService,
} from '../monetization/monetization-webhook.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
import { UsersService } from '../users/users.service.js';

export const WEBHOOK_LEASE_DURATION_MS = 2 * 60 * 1000; // 2 minutes lease duration

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
    @Inject(SlackService) private readonly slackService: SlackService,
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(MonetizationWebhookService)
    private readonly monetizationWebhookService: MonetizationWebhookService,
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

  async getLedgerCsv(userId?: string): Promise<string> {
    const transactions = await this.prisma.transaction.findMany({
      where: userId
        ? {
            OR: [{ senderId: userId }, { receiverId: userId }],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { email: true } },
        receiver: { select: { email: true } },
      },
    });

    const header =
      'ID,Date,Type,Amount,Currency,Status,Sender,Receiver,Description\n';
    const rows = transactions
      .map((tx) => {
        const senderStr = tx.sender?.email || 'SYSTEM';
        const receiverStr = tx.receiver?.email || 'SYSTEM';
        const dateStr = tx.createdAt.toISOString();
        const descStr = (tx.description || '').replace(/"/g, '""');

        return `"${tx.id}","${dateStr}","${tx.type}","${tx.amount}","${tx.currency}","${tx.status}","${senderStr}","${receiverStr}","${descStr}"`;
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { platformSubscriptions: true },
    });

    if (!user)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    const plan = await this.prisma.platformPlan.findFirst({
      where: {
        OR: [{ id: planId }, { stripeProductId: planId }],
      },
    });

    if (!plan)
      throw AppException.NotFound(ErrorCode.PLAN_NOT_FOUND, 'Plan not found');

    const activeStatuses: SubscriptionStatus[] = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
    ];
    const activeSubs = user.platformSubscriptions.filter((s) =>
      activeStatuses.includes(s.status),
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
        'You already have an active platform plan. Cancel or change it via the billing portal before starting another.',
      );
    }

    const stripePriceId =
      billingCycle === 'YEARLY' ? plan.yearlyStripePriceId : plan.stripePriceId;

    if (!stripePriceId) {
      throw new Error(
        `Billing cycle ${billingCycle} is not available for this plan`,
      );
    }

    const intentKey = `${userId}:${plan.id}:${billingCycle}`;
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
            success_url: `${this.frontendUrl}/accounts/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${this.frontendUrl}/accounts/billing?success=false`,
            metadata: {
              userId,
              planId: plan.id,
              billingCycle,
              ...(profileId && { profileId }),
            },
          },
          {
            idempotencyKey: `checkout_sub_${intentKey}`,
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

  async getBillingStatus(userId: string) {
    const subscription = await this.prisma.platformSubscription.findFirst({
      where: {
        userId,
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
    };
  }

  // Heal races: keep only the newly activated plan as ACTIVE.
  private async enforceSingleActivePlatformPlan(
    userId: string,
    keepPlanId: string,
  ) {
    const others = await this.prisma.platformSubscription.findMany({
      where: {
        userId,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
        NOT: { planId: keepPlanId },
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
        // billing below, per FIN-008. Both share this webhook's signature
        // verification and WebhookEvent idempotency bookkeeping.
        if (isMonetizationCheckoutType(metadata?.type)) {
          await this.monetizationWebhookService.handleCheckoutSessionCompleted(
            session,
          );
        } else {
          // Handle Subscriptions (Existing logic)
          const userId = metadata?.userId;
          const planId = metadata?.planId;
          const profileId = metadata?.profileId || null;
          const stripeSubscriptionId = session.subscription as string;

          if (!userId || !planId || !stripeSubscriptionId) {
            this.logger.warn(
              'Checkout session completed but missing metadata or subscription ID',
            );
            return;
          }

          const subscriptionRaw =
            await this.stripeService.getSubscription(stripeSubscriptionId);
          const stripeSubscription = subscriptionRaw as unknown as {
            status: string;
            current_period_start: number;
            current_period_end: number;
            cancel_at_period_end: boolean;
          };

          await this.prisma.platformSubscription.upsert({
            where: { stripeSubscriptionId },
            update: {
              status: this.mapStripeStatus(stripeSubscription.status),
              currentPeriodStart: new Date(
                stripeSubscription.current_period_start * 1000,
              ),
              currentPeriodEnd: new Date(
                stripeSubscription.current_period_end * 1000,
              ),
              cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
              profileId,
            },
            create: {
              userId,
              planId,
              profileId,
              status: this.mapStripeStatus(stripeSubscription.status),
              stripeSubscriptionId: stripeSubscriptionId,
              currentPeriodStart: new Date(
                stripeSubscription.current_period_start * 1000,
              ),
              currentPeriodEnd: new Date(
                stripeSubscription.current_period_end * 1000,
              ),
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

          await this.enforceSingleActivePlatformPlan(userId, planId);

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

          this.slackService
            .sendPaymentAlert({
              eventType: 'Platform Subscription Checkout',
              amount: session.amount_total || 0,
              currency: session.currency || 'eur',
              description: `User ${userId} subscribed to plan ${planId}`,
              userId: userId,
            })
            .catch((e) => this.logger.error(e));
        }

        break;
      }

      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        // Cast via unknown to a specific shape to satisfy the linter
        const subscription = data.object as unknown as {
          id: string;
          status: string;
          current_period_end: number;
          cancel_at_period_end: boolean;
        };

        await this.prisma.platformSubscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: this.mapStripeStatus(subscription.status),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
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
        const invoice = data.object as {
          subscription?: string | { id: string } | null;
        };
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;
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

      case 'charge.refunded':
      case 'charge.dispute.created': {
        await this.monetizationWebhookService.handleChargeRefundedOrDisputed(
          data.object as {
            payment_intent?: string | { id: string } | null;
          },
        );
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
          },
        );
        break;
      }

      default:
        this.logger.warn(`Unhandled Stripe event type: ${type}`);
        Sentry.captureMessage(`Unhandled Stripe event: ${type}`, 'warning');
    }
  }
}
