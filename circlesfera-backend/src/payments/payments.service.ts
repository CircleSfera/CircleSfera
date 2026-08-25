import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SubscriptionStatus } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type Stripe from 'stripe';
import { CREATOR_SHARE_DECIMAL } from '../common/constants/monetization.constants.js';
import { AppException } from '../common/errors/app.exception.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeService) private readonly stripeService: StripeService,
    @Inject(SlackService) private readonly slackService: SlackService,
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Optional()
    private readonly eventEmitter?: EventEmitter2,
  ) {}

  /** Map Stripe status to our SubscriptionStatus enum. */
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
      orderBy: { price: 'asc' },
    });
  }

  async createCheckout(
    userId: string,
    planId: string,
    billingCycle: 'MONTHLY' | 'YEARLY' = 'MONTHLY',
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

    // Ensure customer exists in Stripe
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripeService.createCustomer(user.email);
      customerId = customer.id;
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    if (!customerId)
      throw AppException.BadRequest(
        ErrorCode.STRIPE_CUSTOMER_MISSING,
        'Stripe customer ID is missing',
      );

    return this.stripeService.createCheckoutSession({
      customer: customerId as string,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accounts/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accounts/billing?success=false`,
      metadata: {
        userId,
        planId: plan.id,
        billingCycle,
      },
    });
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
            price: true,
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
            price: subscription.plan.price,
            currency: subscription.plan.currency,
          }
        : null,
    };
  }

  /** Heal races: keep only the newly activated plan as ACTIVE. */
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

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripeService.createCustomer(user.email);
      customerId = customer.id;
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    return this.stripeService.createPortalSession(
      customerId,
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accounts/billing`,
    );
  }

  /**
   * Proxies signature verification to StripeService.
   */
  constructEvent(payload: Buffer, sig: string) {
    return this.stripeService.constructEvent(payload, sig);
  }

  /**
   * Main processor for incoming Stripe webhook events.
   * Idempotent: PROCESSED events are skipped; PENDING/FAILED are reprocessed.
   * On handler failure marks FAILED and rethrows (controller returns 5xx).
   */
  async processWebhookEvent(event: any) {
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { externalId: event.id },
    });

    if (existing?.status === 'PROCESSED') {
      return;
    }

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
          if (
            !raced ||
            raced.status === 'PROCESSED' ||
            raced.status === 'PENDING'
          ) {
            return;
          }
        } else {
          throw err;
        }
      }
    } else if (existing.status === 'FAILED') {
      const { count } = await this.prisma.webhookEvent.updateMany({
        where: { externalId: event.id, status: 'FAILED' },
        data: { status: 'PENDING' },
      });
      if (count === 0) return;
    } else if (existing.status === 'PENDING') {
      return; // Already being processed by another worker
    }

    try {
      await this.dispatchStripeEvent(event);
      await this.prisma.webhookEvent.update({
        where: { externalId: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        this.logger.warn(
          `Idempotency hit (P2002) for event ${event.id}, marking PROCESSED.`,
        );
        await this.prisma.webhookEvent.update({
          where: { externalId: event.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
        return;
      }

      await this.prisma.webhookEvent
        .update({
          where: { externalId: event.id },
          data: { status: 'FAILED' },
        })
        .catch(() => undefined);
      throw err;
    }
  }

  private async dispatchStripeEvent(event: any) {
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

        // Handle Promotions
        if (metadata?.type === 'PROMOTION') {
          const promotionId = metadata.promotionId;
          if (!promotionId) {
            throw AppException.BadRequest(
              ErrorCode.PROMOTION_ID_MISSING,
              'PROMOTION checkout missing promotionId',
            );
          }

          const amount = session.amount_total || 0;
          const currency = (session.currency || 'eur').toUpperCase();

          await this.prisma.$transaction(async (tx) => {
            await tx.promotion.update({
              where: { id: promotionId },
              data: {
                status: 'ACTIVE',
                chargedAt: new Date(),
              },
            });

            await tx.transaction.create({
              data: {
                type: 'PROMOTION_PAYMENT',
                amount,
                currency,
                status: 'COMPLETED',
                senderId: metadata.userId || null,
                receiverId: null,
                promotionId,
                stripePaymentIntentId:
                  typeof session.payment_intent === 'string'
                    ? session.payment_intent
                    : session.payment_intent?.id || session.id,
                description: `Promotion checkout ${session.id}`,
              },
            });
          });

          this.logger.log(
            `Successfully processed promotion payment for ${promotionId}`,
          );
          this.slackService
            .sendPaymentAlert({
              eventType: 'Promotion Payment',
              amount,
              currency: session.currency || 'eur',
              description: `Promotion ID: ${promotionId}`,
            })
            .catch((e) => this.logger.error(e));
        } else if (metadata?.type === 'DIRECT_POST_UNLOCK') {
          // Handle Pay-Per-View Unlock
          const clientReferenceId = session.client_reference_id;
          const { postId, creatorId } = metadata;
          const amount = session.amount_total || 0;
          const paymentIntentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.id;

          if (clientReferenceId && postId && creatorId) {
            await this.prisma.$transaction(async (tx) => {
              await tx.postUnlock.upsert({
                where: { userId_postId: { userId: clientReferenceId, postId } },
                update: {},
                create: {
                  userId: clientReferenceId,
                  postId,
                  pricePaid: amount,
                },
              });

              await tx.transaction.create({
                data: {
                  type: 'DIRECT_POST_UNLOCK',
                  amount: amount,
                  currency: (session.currency || 'eur').toUpperCase(),
                  senderId: clientReferenceId,
                  receiverId: creatorId,
                  postId: postId,
                  stripePaymentIntentId:
                    typeof session.payment_intent === 'string'
                      ? session.payment_intent
                      : session.payment_intent?.id || session.id,
                  status: 'COMPLETED',
                  description: `Direct Post Unlock (Intent: ${paymentIntentId})`,
                },
              });

              await tx.monetization.upsert({
                where: { userId: creatorId },
                update: {
                  lifetimeEarningsCents: {
                    increment: Math.floor(amount * CREATOR_SHARE_DECIMAL),
                  },
                },
                create: {
                  userId: creatorId,
                  lifetimeEarningsCents: Math.floor(
                    amount * CREATOR_SHARE_DECIMAL,
                  ),
                },
              });
            });
            this.logger.log(
              `Successfully processed Post Unlock for user ${clientReferenceId}`,
            );
            this.slackService
              .sendPaymentAlert({
                eventType: 'Post Unlock',
                amount: amount,
                currency: session.currency || 'eur',
                description: `User ${clientReferenceId} unlocked post ${postId} by creator ${creatorId}`,
                userId: clientReferenceId,
              })
              .catch((e) => this.logger.error(e));
          }
        } else if (metadata?.type === 'DIRECT_STORY_UNLOCK') {
          const clientReferenceId = session.client_reference_id;
          const { storyId, creatorId } = metadata;
          const amount = session.amount_total || 0;
          const paymentIntentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id || session.id;

          if (clientReferenceId && storyId && creatorId) {
            await this.prisma.$transaction(async (tx) => {
              await tx.storyUnlock.upsert({
                where: {
                  userId_storyId: { userId: clientReferenceId, storyId },
                },
                update: {},
                create: {
                  userId: clientReferenceId,
                  storyId,
                  pricePaid: amount,
                },
              });

              await tx.transaction.create({
                data: {
                  type: 'DIRECT_STORY_UNLOCK',
                  amount,
                  currency: (session.currency || 'eur').toUpperCase(),
                  senderId: clientReferenceId,
                  receiverId: creatorId,
                  storyId,
                  stripePaymentIntentId:
                    typeof session.payment_intent === 'string'
                      ? session.payment_intent
                      : session.payment_intent?.id || session.id,
                  status: 'COMPLETED',
                  description: `Direct Story Unlock (Intent: ${paymentIntentId})`,
                },
              });

              await tx.monetization.upsert({
                where: { userId: creatorId },
                update: {
                  lifetimeEarningsCents: {
                    increment: Math.floor(amount * CREATOR_SHARE_DECIMAL),
                  },
                },
                create: {
                  userId: creatorId,
                  lifetimeEarningsCents: Math.floor(
                    amount * CREATOR_SHARE_DECIMAL,
                  ),
                },
              });
            });
          }
        } else if (metadata?.type === 'DIRECT_MESSAGE_UNLOCK') {
          const clientReferenceId = session.client_reference_id;
          const { messageId, creatorId } = metadata;
          const amount = session.amount_total || 0;
          const paymentIntentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id || session.id;

          if (clientReferenceId && messageId && creatorId) {
            await this.prisma.$transaction(async (tx: any) => {
              await tx.messageUnlock.upsert({
                where: {
                  userId_messageId: { userId: clientReferenceId, messageId },
                },
                update: {},
                create: {
                  userId: clientReferenceId,
                  messageId,
                  pricePaid: amount,
                },
              });

              await tx.transaction.create({
                data: {
                  type: 'DIRECT_MESSAGE_UNLOCK' as any,
                  amount,
                  currency: (session.currency || 'eur').toUpperCase(),
                  senderId: clientReferenceId,
                  receiverId: creatorId,
                  messageId,
                  stripePaymentIntentId:
                    typeof session.payment_intent === 'string'
                      ? session.payment_intent
                      : session.payment_intent?.id || session.id,
                  status: 'COMPLETED',
                  description: `Direct Message Unlock (Intent: ${paymentIntentId})`,
                },
              });

              await tx.monetization.upsert({
                where: { userId: creatorId },
                update: {
                  lifetimeEarningsCents: {
                    increment: Math.floor(amount * CREATOR_SHARE_DECIMAL),
                  },
                },
                create: {
                  userId: creatorId,
                  lifetimeEarningsCents: Math.floor(
                    amount * CREATOR_SHARE_DECIMAL,
                  ),
                },
              });
            });

            // Emit Real-time Notification
            if (this.eventEmitter) {
              const amountFormatted = (amount / 100).toLocaleString('en-US', {
                style: 'currency',
                currency: session.currency || 'eur',
              });
              this.eventEmitter.emit('notification.create', {
                recipientId: creatorId,
                senderId: clientReferenceId,
                type: 'PAYMENT' as any,
                content: `Someone unlocked your private message for ${amountFormatted}!`,
              });
            }
          }
        } else if (metadata?.type === 'DIRECT_TIP') {
          // Handle Direct Tips
          const clientReferenceId = session.client_reference_id;
          const { creatorId, postId } = metadata;
          const amount = session.amount_total || 0;
          const paymentIntentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.id;

          if (clientReferenceId && creatorId) {
            await this.prisma.$transaction(async (tx) => {
              await tx.transaction.create({
                data: {
                  type: 'DIRECT_TIP',
                  amount: amount,
                  currency: (session.currency || 'eur').toUpperCase(),
                  senderId: clientReferenceId,
                  receiverId: creatorId,
                  postId: postId || null,
                  stripePaymentIntentId:
                    typeof session.payment_intent === 'string'
                      ? session.payment_intent
                      : session.payment_intent?.id || session.id,
                  status: 'COMPLETED',
                  description: `Creator Tip (Intent: ${paymentIntentId})`,
                },
              });

              await tx.monetization.upsert({
                where: { userId: creatorId },
                update: {
                  lifetimeEarningsCents: {
                    increment: Math.floor(amount * CREATOR_SHARE_DECIMAL),
                  },
                },
                create: {
                  userId: creatorId,
                  lifetimeEarningsCents: Math.floor(
                    amount * CREATOR_SHARE_DECIMAL,
                  ),
                },
              });
            });
            this.logger.log(
              `Successfully processed Tip from user ${clientReferenceId} to ${creatorId}`,
            );
            this.slackService
              .sendPaymentAlert({
                eventType: 'Creator Tip',
                amount: amount,
                currency: session.currency || 'eur',
                description: `User ${clientReferenceId} tipped creator ${creatorId}`,
                userId: clientReferenceId,
              })
              .catch((e) => this.logger.error(e));

            // Emit Real-time Notification
            if (this.eventEmitter) {
              const amountFormatted = (amount / 100).toLocaleString('en-US', {
                style: 'currency',
                currency: session.currency || 'eur',
              });
              this.eventEmitter.emit('notification.create', {
                recipientId: creatorId,
                senderId: clientReferenceId,
                type: 'PAYMENT' as any,
                content: `You received a ${amountFormatted} tip!`,
                postId: postId || undefined,
              });
            }
          }
        } else if (metadata?.type === 'DIRECT_LIVE_GIFT') {
          const clientReferenceId = session.client_reference_id;
          const { liveGiftId, streamId, giftId, creatorId } = metadata;
          const amount = session.amount_total || 0;
          const paymentIntentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id || session.id;

          if (clientReferenceId && liveGiftId && streamId && creatorId) {
            if (this.eventEmitter) {
              this.eventEmitter.emit('payment.live_gift_completed', {
                liveGiftId,
                senderId: clientReferenceId,
                streamId,
                giftId,
                creatorId,
                amountCents: amount,
                currency: session.currency || 'eur',
                paymentIntentId,
              });
            }
            this.logger.log(
              `Successfully processed Live Gift ${liveGiftId} from ${clientReferenceId}`,
            );
            this.slackService
              .sendPaymentAlert({
                eventType: 'Live Gift',
                amount,
                currency: session.currency || 'eur',
                description: `User ${clientReferenceId} gifted ${giftId} on stream ${streamId}`,
                userId: clientReferenceId,
              })
              .catch((e) => this.logger.error(e));
          } else if (!this.eventEmitter) {
            this.logger.error(
              'EventEmitter not available to complete DIRECT_LIVE_GIFT',
            );
          }
        } else if (metadata?.type === 'STRIPE_SUBSCRIPTION') {
          // VIP Subscriptions removed in Phase 11
          console.log('Legacy VIP Subscription event ignored.');
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

          const subscriptionRaw =
            await this.stripeService.getSubscription(stripeSubscriptionId);
          const stripeSubscription = subscriptionRaw as unknown as {
            status: string;
            current_period_start: number;
            current_period_end: number;
            cancel_at_period_end: boolean;
          };

          await this.prisma.platformSubscription.upsert({
            where: { userId_planId: { userId, planId } },
            update: {
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
            create: {
              userId,
              planId,
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
        if (platformSub) {
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
        const session = data.object;
        const metadata = session.metadata;
        if (metadata?.type === 'PROMOTION' && metadata.promotionId) {
          await this.prisma.promotion.updateMany({
            where: {
              id: metadata.promotionId,
              status: 'PENDING',
            },
            data: { status: 'FAILED' },
          });
        }
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
          if (platformSub) {
            await this.usersService.syncUserTier(platformSub.userId);
          }
        }
        break;
      }

      case 'charge.refunded':
      case 'charge.dispute.created': {
        const charge = data.object as {
          payment_intent?: string | { id: string } | null;
        };
        const paymentIntentId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (paymentIntentId) {
          await this.revokeAccessForPaymentIntent(paymentIntentId);
        }
        break;
      }

      case 'account.updated': {
        const account = data.object as {
          id: string;
          charges_enabled?: boolean;
          capabilities?: { transfers?: string };
        };
        const user = await this.prisma.user.findFirst({
          where: { stripeConnectAccountId: account.id },
          select: { id: true },
        });
        if (user) {
          await this.prisma.monetization.upsert({
            where: { userId: user.id },
            update: {
              transfersEnabled: account.capabilities?.transfers === 'active',
              chargesEnabled: account.charges_enabled === true,
            },
            create: {
              userId: user.id,
              transfersEnabled: account.capabilities?.transfers === 'active',
              chargesEnabled: account.charges_enabled === true,
            },
          });
        }
        break;
      }

      default:
        this.logger.warn(`Unhandled Stripe event type: ${type}`);
        Sentry.captureMessage(`Unhandled Stripe event: ${type}`, 'warning');
    }
  }

  /** Revoke unlock entitlements after refund or dispute. */
  private async revokeAccessForPaymentIntent(paymentIntentId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!tx) {
      return;
    }

    await this.prisma.transaction.update({
      where: { id: tx.id },
      data: { status: 'REFUNDED' },
    });

    if (tx.type === 'DIRECT_POST_UNLOCK' && tx.senderId && tx.postId) {
      await this.prisma.postUnlock.deleteMany({
        where: { userId: tx.senderId, postId: tx.postId },
      });
    }
    if (tx.type === 'DIRECT_STORY_UNLOCK' && tx.senderId && tx.storyId) {
      await this.prisma.storyUnlock.deleteMany({
        where: { userId: tx.senderId, storyId: tx.storyId },
      });
    }
  }
}
