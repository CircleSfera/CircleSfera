import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

function appendCheckoutQuery(returnUrl: string, query: string): string {
  const sep = returnUrl.includes('?') ? '&' : '?';
  return `${returnUrl}${sep}${query}`;
}

@Injectable()
export class MonetizationService {
  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
  ) {}

  async getMonetization(userId: string) {
    let monetization = await this.prisma.monetization.findUnique({
      where: { userId },
    });
    if (!monetization) {
      monetization = await this.prisma.monetization.create({
        data: { userId },
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeConnectAccountId: true },
    });

    return {
      ...monetization,
      hasStripeAccount: !!user?.stripeConnectAccountId,
    };
  }

  async getTransactions(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const transactions = await this.prisma.transaction.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            profile: { select: { username: true, avatar: true } },
          },
        },
        receiver: {
          select: {
            id: true,
            profile: { select: { username: true, avatar: true } },
          },
        },
      },
    });

    const total = await this.prisma.transaction.count({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
    });

    return {
      data: transactions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // --- NEW DIRECT MONETIZATION METHODS ---

  async createPostUnlockSession(
    userId: string,
    postId: string,
    returnUrl: string,
    idempotencyKey?: string,
  ) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { user: true },
    });

    if (!post?.isPremium || !post.priceCents) {
      throw new BadRequestException('This post is not premium or has no price');
    }
    if (post.userId === userId) {
      throw new BadRequestException('You cannot buy your own post');
    }

    const creator = post.user;
    if (!creator.stripeConnectAccountId) {
      throw new BadRequestException(
        'Creator has not setup their Stripe account',
      );
    }

    const buyer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!buyer) throw new NotFoundException('Buyer not found');

    // Platform takes 20% commission
    const platformFee = Math.floor(post.priceCents * 0.2);

    const session = await this.stripeService.createCheckoutSession(
      {
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: buyer.email,
        client_reference_id: userId,
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: 'Premium Post Unlock',
                description: `Unlock exclusive content from ${creator.email}`,
              },
              unit_amount: post.priceCents,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: {
            destination: creator.stripeConnectAccountId,
          },
        },
        metadata: {
          type: 'DIRECT_POST_UNLOCK',
          postId: postId,
          creatorId: creator.id,
        },
        success_url: appendCheckoutQuery(
          returnUrl,
          'success=true&session_id={CHECKOUT_SESSION_ID}',
        ),
        cancel_url: appendCheckoutQuery(returnUrl, 'canceled=true'),
      },
      {
        idempotencyKey: idempotencyKey,
      },
    );

    return { url: session.url };
  }

  async createStoryUnlockSession(
    userId: string,
    storyId: string,
    returnUrl: string,
    idempotencyKey?: string,
  ) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      include: { user: true },
    });

    if (!story?.isPremium || !story.priceCents) {
      throw new BadRequestException(
        'This story is not premium or has no price',
      );
    }
    if (story.userId === userId) {
      throw new BadRequestException('You cannot buy your own story');
    }

    const existing = await this.prisma.storyUnlock.findUnique({
      where: { userId_storyId: { userId, storyId } },
    });
    if (existing) {
      throw new BadRequestException('Story already unlocked');
    }

    const creator = story.user;
    if (!creator.stripeConnectAccountId) {
      throw new BadRequestException(
        'Creator has not setup their Stripe account',
      );
    }

    const buyer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!buyer) throw new NotFoundException('Buyer not found');

    const platformFee = Math.floor(story.priceCents * 0.2);

    const session = await this.stripeService.createCheckoutSession(
      {
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: buyer.email,
        client_reference_id: userId,
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: 'Premium Story Unlock',
                description: `Unlock exclusive story from ${creator.email}`,
              },
              unit_amount: story.priceCents,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: {
            destination: creator.stripeConnectAccountId,
          },
        },
        metadata: {
          type: 'DIRECT_STORY_UNLOCK',
          storyId,
          creatorId: creator.id,
        },
        success_url: appendCheckoutQuery(
          returnUrl,
          'success=true&session_id={CHECKOUT_SESSION_ID}',
        ),
        cancel_url: appendCheckoutQuery(returnUrl, 'canceled=true'),
      },
      { idempotencyKey },
    );

    return { url: session.url };
  }

  async createTipSession(
    senderId: string,
    receiverId: string,
    amountCents: number,
    returnUrl: string,
    postId?: string,
    idempotencyKey?: string,
  ) {
    if (amountCents < 100) {
      throw new BadRequestException('Minimum tip is €1.00');
    }
    if (senderId === receiverId)
      throw new BadRequestException('Cannot tip yourself');

    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
    });
    if (!receiver?.stripeConnectAccountId) {
      throw new BadRequestException(
        'Creator cannot receive tips yet (no Stripe account)',
      );
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
    });
    if (!sender) throw new NotFoundException('Sender not found');

    const platformFee = Math.floor(amountCents * 0.2);

    const session = await this.stripeService.createCheckoutSession(
      {
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: sender.email,
        client_reference_id: senderId,
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: 'Creator Tip',
                description: `Tip for ${receiver.email}`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: {
            destination: receiver.stripeConnectAccountId,
          },
        },
        metadata: {
          type: 'DIRECT_TIP',
          creatorId: receiverId,
          postId: postId || '',
        },
        success_url: appendCheckoutQuery(
          returnUrl,
          'success=true&session_id={CHECKOUT_SESSION_ID}',
        ),
        cancel_url: appendCheckoutQuery(returnUrl, 'canceled=true'),
      },
      {
        idempotencyKey: idempotencyKey,
      },
    );

    return { url: session.url };
  }

  async onboardConnectAccount(
    userId: string,
    returnUrl: string,
    refreshUrl: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    try {
      let accountId = user.stripeConnectAccountId;
      if (!accountId) {
        const account = await this.stripeService.createExpressAccount(
          user.email,
        );
        accountId = account.id;
        await this.prisma.user.update({
          where: { id: userId },
          data: { stripeConnectAccountId: accountId },
        });
      }

      const link = await this.stripeService.createAccountLink(
        accountId,
        returnUrl,
        refreshUrl,
      );
      return { url: link.url };
    } catch (error: unknown) {
      console.error('Stripe Connect Onboarding Error:', error);
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to connect with Stripe',
      );
    }
  }

  async getAccountStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.stripeConnectAccountId) {
      return {
        connected: false,
        transfersEnabled: false,
        chargesEnabled: false,
      };
    }

    const cached = await this.prisma.monetization.findUnique({
      where: { userId },
      select: { transfersEnabled: true, chargesEnabled: true },
    });

    try {
      const account = await this.stripeService.getAccount(
        user.stripeConnectAccountId,
      );
      const transfersEnabled = account.capabilities?.transfers === 'active';
      const chargesEnabled = account.charges_enabled === true;
      await this.prisma.monetization.upsert({
        where: { userId },
        update: { transfersEnabled, chargesEnabled },
        create: { userId, transfersEnabled, chargesEnabled },
      });
      return {
        connected: true,
        transfersEnabled,
        chargesEnabled,
        detailsSubmitted: account.details_submitted,
      };
    } catch (error) {
      console.error('Stripe Get Account Error:', error);
      return {
        connected: true,
        transfersEnabled: cached?.transfersEnabled ?? false,
        chargesEnabled: cached?.chargesEnabled ?? false,
        detailsSubmitted: false,
      };
    }
  }

  async getDashboardLink(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.stripeConnectAccountId) {
      throw new BadRequestException('Stripe Connect account not set up yet');
    }

    const link = await this.stripeService.createLoginLink(
      user.stripeConnectAccountId,
    );
    return { url: link.url };
  }
}
