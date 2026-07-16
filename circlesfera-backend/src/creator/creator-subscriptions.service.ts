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

  async createSubscriptionSession(
    subscriberId: string,
    creatorId: string,
    priceCents: number,
    returnUrl: string,
  ) {
    if (subscriberId === creatorId) {
      throw new BadRequestException('Cannot subscribe to yourself');
    }

    if (priceCents < 100) {
      throw new BadRequestException('Minimum subscription is $1.00 USD/month');
    }

    if (process.env.NODE_ENV !== 'production') {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      await this.prisma.creatorSubscription.upsert({
        where: { subscriberId_creatorId: { subscriberId, creatorId } },
        update: { status: 'ACTIVE', expiresAt },
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

    // Usamos Stripe Checkout en modo "subscription"
    const session = await this.stripeService.createCheckoutSession({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: subscriber.email,
      client_reference_id: subscriberId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            product_data: {
              name: `VIP Subscription to ${creator.email}`,
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
      success_url: `${returnUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}?canceled=true`,
    });

    return { url: session.url };
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
}
