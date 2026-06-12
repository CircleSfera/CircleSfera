/** Trigger re-index */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountType,
  SubscriptionStatus,
  VerificationLevel,
} from '@prisma/client';
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
  ) {
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

  async getPortalUrl(userId: string) {
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
