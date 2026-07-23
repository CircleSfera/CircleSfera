/** Trigger re-index */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { StripeService } from '../common/stripe/stripe.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
import { UsersService } from '../users/users.service.js';

/** Trigger re-index */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeService) private readonly stripeService: StripeService,
    @Inject(SlackService) private readonly slackService: SlackService,
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(UsersService) private readonly usersService: UsersService,
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

    if (!user) throw new NotFoundException('User not found');

    const plan = await this.prisma.platformPlan.findFirst({
      where: {
        OR: [{ id: planId }, { stripeProductId: planId }],
      },
    });

    if (!plan) throw new NotFoundException('Plan not found');

    const activeStatuses: SubscriptionStatus[] = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
    ];
    const activeSubs = user.platformSubscriptions.filter((s) =>
      activeStatuses.includes(s.status),
    );

    if (activeSubs.some((s) => s.planId === plan.id)) {
      throw new BadRequestException(
        'You already have an active subscription to this plan. Manage it in the billing portal.',
      );
    }

    if (activeSubs.length > 0) {
      throw new ConflictException(
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

    if (!customerId) throw new Error('Stripe customer ID is missing');

    return this.stripeService.createCheckoutSession({
      customer: customerId as string,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accounts/edit?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accounts/edit?success=false`,
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
      if (other.stripeSubscriptionId) {
        try {
          await this.stripeService.cancelSubscription(
            other.stripeSubscriptionId,
            false,
          );
        } catch (err) {
          console.error(
            `Failed to cancel Stripe sub ${other.stripeSubscriptionId}`,
            err,
          );
        }
      }
      await this.prisma.platformSubscription.update({
        where: { id: other.id },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelAtPeriodEnd: false,
        },
      });
    }
  }

  async getPortalUrl(
    userId: string,
  ): Promise<Stripe.BillingPortal.Session | { url: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
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
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accounts/edit`,
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
          if (!raced || raced.status === 'PROCESSED') {
            return;
          }
        } else {
          throw err;
        }
      }
    }

    try {
      await this.dispatchStripeEvent(event);
      await this.prisma.webhookEvent.update({
        where: { externalId: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (err) {
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

    console.log(`Processing Stripe webhook event: ${type}`);

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
            throw new Error('PROMOTION checkout missing promotionId');
          }

          await this.prisma.promotion.update({
            where: { id: promotionId },
            data: {
              status: 'ACTIVE',
              chargedAt: new Date(),
            },
          });

          const amount = session.amount_total || 0;
          const currency = (session.currency || 'eur').toUpperCase();
          await this.prisma.transaction.create({
            data: {
              type: 'PROMOTION_PAYMENT',
              amount,
              currency,
              status: 'COMPLETED',
              senderId: metadata.userId || null,
              receiverId: null,
              promotionId,
              description: `Promotion checkout ${session.id}`,
            },
          });

          console.log(
            `Successfully processed promotion payment for ${promotionId}`,
          );
          this.slackService
            .sendPaymentAlert({
              eventType: 'Promotion Payment',
              amount,
              currency: session.currency || 'usd',
              description: `Promotion ID: ${promotionId}`,
            })
            .catch((e) => console.error(e));
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
                  currency: (session.currency || 'usd').toUpperCase(),
                  senderId: clientReferenceId,
                  receiverId: creatorId,
                  postId: postId,
                  status: 'COMPLETED',
                  description: `Direct Post Unlock (Intent: ${paymentIntentId})`,
                },
              });

              await tx.monetization.upsert({
                where: { userId: creatorId },
                update: {
                  lifetimeEarningsCents: {
                    increment: Math.floor(amount * 0.8),
                  },
                },
                create: {
                  userId: creatorId,
                  lifetimeEarningsCents: Math.floor(amount * 0.8),
                },
              });
            });
            console.log(
              `Successfully processed Post Unlock for user ${clientReferenceId}`,
            );
            this.slackService
              .sendPaymentAlert({
                eventType: 'Post Unlock',
                amount: amount,
                currency: session.currency || 'usd',
                description: `User ${clientReferenceId} unlocked post ${postId} by creator ${creatorId}`,
                userId: clientReferenceId,
              })
              .catch((e) => console.error(e));
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
                  currency: (session.currency || 'usd').toUpperCase(),
                  senderId: clientReferenceId,
                  receiverId: creatorId,
                  postId: postId || null,
                  status: 'COMPLETED',
                  description: `Creator Tip (Intent: ${paymentIntentId})`,
                },
              });

              await tx.monetization.upsert({
                where: { userId: creatorId },
                update: {
                  lifetimeEarningsCents: {
                    increment: Math.floor(amount * 0.8),
                  },
                },
                create: {
                  userId: creatorId,
                  lifetimeEarningsCents: Math.floor(amount * 0.8),
                },
              });
            });
            console.log(
              `Successfully processed Tip from user ${clientReferenceId} to ${creatorId}`,
            );
            this.slackService
              .sendPaymentAlert({
                eventType: 'Creator Tip',
                amount: amount,
                currency: session.currency || 'usd',
                description: `User ${clientReferenceId} tipped creator ${creatorId}`,
                userId: clientReferenceId,
              })
              .catch((e) => console.error(e));
          }
        } else if (metadata?.type === 'STRIPE_SUBSCRIPTION') {
          // Handle Creator Subscriptions
          const subscriberId = session.client_reference_id;
          const { creatorId, priceCents } = metadata;
          const stripeSubscriptionId = session.subscription as string;

          if (subscriberId && creatorId && stripeSubscriptionId) {
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + 1);

            await this.prisma.creatorSubscription.upsert({
              where: { subscriberId_creatorId: { subscriberId, creatorId } },
              update: {
                status: 'ACTIVE',
                stripeSubscriptionId,
                priceCents: parseInt(priceCents, 10),
                expiresAt,
              },
              create: {
                subscriberId,
                creatorId,
                status: 'ACTIVE',
                stripeSubscriptionId,
                priceCents: parseInt(priceCents, 10),
                expiresAt,
              },
            });

            await this.prisma.transaction.create({
              data: {
                type: 'STRIPE_SUBSCRIPTION',
                amount: session.amount_total || parseInt(priceCents, 10) || 0,
                currency: (session.currency || 'usd').toUpperCase(),
                status: 'COMPLETED',
                senderId: subscriberId,
                receiverId: creatorId,
                description: `Creator VIP subscription ${stripeSubscriptionId}`,
              },
            });

            console.log(
              `Successfully processed Creator Subscription from ${subscriberId} to ${creatorId}`,
            );

            const user = await this.prisma.user.findUnique({
              where: { id: subscriberId },
              select: { email: true },
            });
            const creator = await this.prisma.user.findUnique({
              where: { id: creatorId },
              select: { profile: true },
            });

            if (user && creator?.profile) {
              const formattedAmount = new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: session.currency?.toUpperCase() || 'EUR',
              }).format(parseInt(priceCents, 10) / 100);
              this.emailService
                .sendSubscriptionReceipt(
                  user.email,
                  `Suscripción a ${creator.profile.username}`,
                  formattedAmount,
                )
                .catch((e) => console.error(e));
            }

            this.slackService
              .sendPaymentAlert({
                eventType: 'Creator Subscription',
                amount: parseInt(priceCents, 10),
                currency: session.currency || 'usd',
                description: `User ${subscriberId} subscribed to creator ${creatorId}`,
                userId: subscriberId,
              })
              .catch((e) => console.error(e));
          }
        } else {
          // Handle Subscriptions (Existing logic)
          const userId = metadata?.userId;
          const planId = metadata?.planId;
          const stripeSubscriptionId = session.subscription as string;

          if (!userId || !planId || !stripeSubscriptionId) {
            console.warn(
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

          console.log(
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
                .catch((e) => console.error(e));
            }
          }

          this.slackService
            .sendPaymentAlert({
              eventType: 'Platform Subscription Checkout',
              amount: session.amount_total || 0,
              currency: session.currency || 'usd',
              description: `User ${userId} subscribed to plan ${planId}`,
              userId: userId,
            })
            .catch((e) => console.error(e));
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

        const creatorSubStatus =
          subscription.status === 'active' || subscription.status === 'trialing'
            ? 'ACTIVE'
            : 'CANCELLED';
        await this.prisma.creatorSubscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: creatorSubStatus,
            autoRenew: !subscription.cancel_at_period_end,
            ...(creatorSubStatus === 'CANCELLED'
              ? { expiresAt: new Date() }
              : {
                  expiresAt: new Date(subscription.current_period_end * 1000),
                }),
          },
        });

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

      case 'identity.verification_session.verified': {
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
          await this.prisma.creatorSubscription.updateMany({
            where: { stripeSubscriptionId: subscriptionId },
            data: { status: 'CANCELLED', autoRenew: false },
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

      default:
        console.log(`Unhandled event type: ${type}`);
    }
  }
}
