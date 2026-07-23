import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CreatorSubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
  ) {}

  /**
   * Creates a Stripe Checkout subscription using the creator's canonical
   * `profile.subscriptionPriceCents`. Client-supplied prices are ignored.
   */
  async createSubscriptionSession(
    subscriberId: string,
    creatorId: string,
    returnUrl: string,
  ) {
    if (subscriberId === creatorId) {
      throw new BadRequestException('Cannot subscribe to yourself');
    }

    const creatorProfile = await this.prisma.profile.findUnique({
      where: { userId: creatorId },
      select: { subscriptionPriceCents: true, username: true },
    });
    const priceCents = creatorProfile?.subscriptionPriceCents;
    if (priceCents == null || priceCents < 100) {
      throw new BadRequestException(
        'Creator has not set a valid VIP subscription price',
      );
    }

    // Dev-only free path requires explicit opt-in (never accidental in staging)
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.ALLOW_DEV_CREATOR_SUBS === 'true'
    ) {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      await this.prisma.creatorSubscription.upsert({
        where: { subscriberId_creatorId: { subscriberId, creatorId } },
        update: { status: 'ACTIVE', expiresAt, priceCents },
        create: {
          subscriberId,
          creatorId,
          status: 'ACTIVE',
          priceCents,
          expiresAt,
        },
      });
      return { url: null, success: true };
    }

    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
    });
    if (!creator?.stripeConnectAccountId) {
      throw new BadRequestException('Creator has not setup Stripe Connect');
    }

    const subscriber = await this.prisma.user.findUnique({
      where: { id: subscriberId },
    });
    if (!subscriber) throw new NotFoundException('Subscriber not found');

    const existing = await this.prisma.creatorSubscription.findUnique({
      where: { subscriberId_creatorId: { subscriberId, creatorId } },
    });

    if (
      existing &&
      existing.status === 'ACTIVE' &&
      existing.expiresAt > new Date()
    ) {
      throw new BadRequestException('Already actively subscribed');
    }

    const session = await this.stripeService.createCheckoutSession({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: subscriber.email,
      client_reference_id: subscriberId,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            recurring: { interval: 'month' },
            product_data: {
              name: `VIP Subscription to @${creatorProfile.username}`,
              description: 'Monthly premium content access',
            },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        application_fee_percent: 20.0,
        transfer_data: {
          destination: creator.stripeConnectAccountId,
        },
      },
      metadata: {
        type: 'STRIPE_SUBSCRIPTION',
        creatorId: creatorId,
        priceCents: priceCents.toString(),
      },
      success_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}canceled=true`,
    });

    return { url: session.url };
  }

  async setSubscriptionPrice(creatorId: string, priceCents: number) {
    if (priceCents < 100) {
      throw new BadRequestException('Minimum subscription is $1.00 USD/month');
    }
    return this.prisma.profile.update({
      where: { userId: creatorId },
      data: { subscriptionPriceCents: priceCents },
      select: { subscriptionPriceCents: true, username: true },
    });
  }

  async checkSubscription(subscriberId: string, creatorId: string) {
    const sub = await this.prisma.creatorSubscription.findUnique({
      where: { subscriberId_creatorId: { subscriberId, creatorId } },
    });

    if (!sub) return { isSubscribed: false };

    const isActive = sub.status === 'ACTIVE' && sub.expiresAt > new Date();
    return { isSubscribed: isActive, expiresAt: sub.expiresAt };
  }

  async getMySubscriptions(subscriberId: string) {
    return this.prisma.creatorSubscription.findMany({
      where: { subscriberId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      include: {
        creator: {
          select: {
            id: true,
            profile: { select: { username: true, avatar: true } },
          },
        },
      },
    });
  }

  async cancelSubscription(subscriberId: string, creatorId: string) {
    const sub = await this.prisma.creatorSubscription.findUnique({
      where: { subscriberId_creatorId: { subscriberId, creatorId } },
    });

    if (sub?.status !== 'ACTIVE') {
      throw new NotFoundException('Active subscription not found');
    }

    if (sub.stripeSubscriptionId) {
      await this.stripeService.cancelSubscription(
        sub.stripeSubscriptionId,
        true,
      );
      await this.prisma.creatorSubscription.update({
        where: { id: sub.id },
        data: { autoRenew: false },
      });
      return {
        success: true,
        cancelAtPeriodEnd: true,
        expiresAt: sub.expiresAt,
      };
    }

    await this.prisma.creatorSubscription.update({
      where: { id: sub.id },
      data: {
        status: 'CANCELLED',
        autoRenew: false,
        expiresAt: new Date(),
      },
    });

    return { success: true, cancelAtPeriodEnd: false };
  }
}
