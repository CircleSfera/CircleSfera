/** Trigger re-index */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountType,
  SubscriptionStatus,
  VerificationLevel,
} from '@prisma/client';
import type Stripe from 'stripe';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Trigger re-index */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeService) private readonly stripeService: StripeService,
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
        return SubscriptionStatus.ACTIVE; // Fallback
    }
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

    const plan = await this.prisma.platformPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) throw new NotFoundException('Plan not found');

    if (process.env.PAYMENT_MODE === 'SIMULATOR') {
      const newAccountType =
        plan.name === 'Elite Creator'
          ? AccountType.CREATOR
          : plan.name === 'Business'
            ? AccountType.BUSINESS
            : user.accountType;

      const newVerificationLevel =
        plan.name === 'Premium' || plan.name === 'Elite Creator'
          ? VerificationLevel.VERIFIED
          : plan.name === 'Business'
            ? VerificationLevel.BUSINESS
            : user.verificationLevel;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          accountType: newAccountType,
          verificationLevel: newVerificationLevel,
        },
      });

      return {
        url: `${process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:8080'}/creator?success=true`,
      };
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
        planId,
        billingCycle,
      },
    });
  }

  async getPortalUrl(
    userId: string,
  ): Promise<Stripe.BillingPortal.Session | { url: string }> {
    if (process.env.PAYMENT_MODE === 'SIMULATOR') {
      return {
        url: `${process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:8080'}/creator`,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.stripeCustomerId) {
      throw new NotFoundException('Stripe customer not found for this user');
    }

    return this.stripeService.createPortalSession(
      user.stripeCustomerId,
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
   * Handles subscription lifecycle events.
   */
  async processWebhookEvent(event: any) {
    const { type, data } = event;

    console.log(`Processing Stripe webhook event: ${type}`);

    // Log the event for idempotency/audit (using the model in schema)
    await this.prisma.webhookEvent
      .create({
        data: {
          provider: 'stripe',
          externalId: event.id,
          payload: event as unknown as object,
          status: 'PENDING',
        },
      })
      .catch((err: Error) =>
        console.warn(
          'Could not log webhook event (likely duplicate):',
          err.message,
        ),
      );

    switch (type) {
      case 'checkout.session.completed': {
        const session = data.object;
        const metadata = session.metadata;

        // Handle Promotions
        if (metadata?.type === 'PROMOTION') {
          const promotionId = metadata.promotionId;
          if (!promotionId) return;

          await this.prisma.promotion.update({
            where: { id: promotionId },
            data: {
              status: 'PENDING', // Now confirmed as paid
            },
          });

          console.log(
            `Successfully processed promotion payment for ${promotionId}`,
          );
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
            console.log(
              `Successfully processed Creator Subscription from ${subscriberId} to ${creatorId}`,
            );
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
            let newAccountType: AccountType | undefined;
            let newVerificationLevel: VerificationLevel | undefined;

            const name = plan.name.toLowerCase();
            if (name.includes('premium')) {
              newVerificationLevel = VerificationLevel.VERIFIED;
            } else if (name.includes('elite')) {
              newVerificationLevel = VerificationLevel.VERIFIED;
              newAccountType = AccountType.CREATOR;
            } else if (name.includes('business')) {
              newVerificationLevel = VerificationLevel.BUSINESS;
              newAccountType = AccountType.BUSINESS;
            }

            if (newVerificationLevel || newAccountType) {
              await this.prisma.user.update({
                where: { id: userId },
                data: {
                  ...(newAccountType && { accountType: newAccountType }),
                  ...(newVerificationLevel && {
                    verificationLevel: newVerificationLevel,
                  }),
                },
              });
            }
          }

          console.log(
            `Successfully processed checkout for user ${userId}, plan ${planId}`,
          );
        }

        // Update event status
        await this.prisma.webhookEvent.update({
          where: { externalId: event.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
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

        // Downgrade user privileges if subscription is actually deleted or past due
        const newStatus = this.mapStripeStatus(subscription.status);
        if (
          newStatus === SubscriptionStatus.CANCELLED ||
          newStatus === SubscriptionStatus.EXPIRED ||
          newStatus === SubscriptionStatus.PAST_DUE
        ) {
          const sub = await this.prisma.platformSubscription.findFirst({
            where: { stripeSubscriptionId: subscription.id },
            select: { userId: true },
          });

          if (sub) {
            await this.prisma.user.update({
              where: { id: sub.userId },
              data: {
                accountType: AccountType.PERSONAL,
                verificationLevel: VerificationLevel.BASIC,
              },
            });
            console.log(
              `Downgraded user ${sub.userId} privileges due to subscription ${newStatus}`,
            );
          }
        }

        await this.prisma.webhookEvent.update({
          where: { externalId: event.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
        break;
      }

      default:
        console.log(`Unhandled event type: ${type}`);
    }
  }
}
