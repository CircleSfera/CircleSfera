import { ErrorCode } from '@circlesfera/shared';
import { Injectable, Logger } from '@nestjs/common';
import { PLATFORM_FEE_DECIMAL } from '../common/constants/monetization.constants.js';
import { AppException } from '../common/errors/app.exception.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

function appendCheckoutQuery(returnUrl: string, query: string): string {
  const sep = returnUrl.includes('?') ? '&' : '?';
  return `${returnUrl}${sep}${query}`;
}

@Injectable()
export class MonetizationService {
  private readonly logger = new Logger(MonetizationService.name);

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
    profileId: string,
    postId: string,
    returnUrl: string,
    idempotencyKey?: string,
  ) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { profile: { include: { user: true } } },
    });

    if (!post?.isPremium || !post.priceCents) {
      throw AppException.BadRequest(
        ErrorCode.NOT_PREMIUM_OR_NO_PRICE,
        'This post is not premium or has no price',
      );
    }
    if (post.profileId === profileId) {
      throw AppException.BadRequest(
        ErrorCode.CANNOT_BUY_OWN_CONTENT,
        'You cannot buy your own post',
      );
    }

    const creator = (post as any).profile.user;
    if (!creator.stripeConnectAccountId) {
      throw AppException.BadRequest(
        ErrorCode.CREATOR_STRIPE_NOT_SETUP,
        'Creator has not setup their Stripe account',
      );
    }

    const buyer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!buyer)
      throw AppException.NotFound(ErrorCode.BUYER_NOT_FOUND, 'Buyer not found');

    // Platform takes 20% commission
    const platformFee = Math.floor(post.priceCents * PLATFORM_FEE_DECIMAL);

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
    profileId: string,
    storyId: string,
    returnUrl: string,
    idempotencyKey?: string,
  ) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      include: { profile: { include: { user: true } } },
    });

    if (!story?.isPremium || !story.priceCents) {
      throw AppException.BadRequest(
        ErrorCode.NOT_PREMIUM_OR_NO_PRICE,
        'This story is not premium or has no price',
      );
    }
    if (story.profileId === profileId) {
      throw AppException.BadRequest(
        ErrorCode.CANNOT_BUY_OWN_CONTENT,
        'You cannot buy your own story',
      );
    }

    const existing = await this.prisma.storyUnlock.findUnique({
      where: { userId_storyId: { userId, storyId } },
    });
    if (existing) {
      throw AppException.BadRequest(
        ErrorCode.CONTENT_ALREADY_UNLOCKED,
        'Story already unlocked',
      );
    }

    const creator = (story as any).profile.user;
    if (!creator.stripeConnectAccountId) {
      throw AppException.BadRequest(
        ErrorCode.CREATOR_STRIPE_NOT_SETUP,
        'Creator has not setup their Stripe account',
      );
    }

    const buyer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!buyer)
      throw AppException.NotFound(ErrorCode.BUYER_NOT_FOUND, 'Buyer not found');

    const platformFee = Math.floor(story.priceCents * PLATFORM_FEE_DECIMAL);

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

  async createMessageUnlockSession(
    userId: string,
    messageId: string,
    returnUrl: string,
    idempotencyKey?: string,
  ) {
    const message = (await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { sender: true },
    })) as any;

    if (!message?.isLocked || !message.priceCents) {
      throw AppException.BadRequest(
        ErrorCode.NOT_PREMIUM_OR_NO_PRICE,
        'This message is not locked or has no price',
      );
    }
    if (message.senderId === userId) {
      throw AppException.BadRequest(
        ErrorCode.CANNOT_BUY_OWN_CONTENT,
        'You cannot unlock your own message',
      );
    }

    const existing = await (this.prisma as any).messageUnlock.findUnique({
      where: { userId_messageId: { userId, messageId } },
    });
    if (existing) {
      throw AppException.BadRequest(
        ErrorCode.CONTENT_ALREADY_UNLOCKED,
        'Message already unlocked',
      );
    }

    const creator = message.sender;
    if (!creator.stripeConnectAccountId) {
      throw AppException.BadRequest(
        ErrorCode.CREATOR_STRIPE_NOT_SETUP,
        'Creator has not setup their Stripe account',
      );
    }

    const buyer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!buyer)
      throw AppException.NotFound(ErrorCode.BUYER_NOT_FOUND, 'Buyer not found');

    const platformFee = Math.floor(message.priceCents * PLATFORM_FEE_DECIMAL);

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
                name: 'Locked Message Unlock',
                description: `Unlock exclusive message from ${creator.email}`,
              },
              unit_amount: message.priceCents,
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
          type: 'DIRECT_MESSAGE_UNLOCK',
          messageId,
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
      throw AppException.BadRequest(
        ErrorCode.MINIMUM_TIP_NOT_MET,
        'Minimum tip is €1.00',
      );
    }
    if (senderId === receiverId)
      throw AppException.BadRequest(
        ErrorCode.CANNOT_TIP_SELF,
        'Cannot tip yourself',
      );

    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
    });
    if (!receiver?.stripeConnectAccountId) {
      throw AppException.BadRequest(
        ErrorCode.CREATOR_STRIPE_NOT_SETUP,
        'Creator cannot receive tips yet (no Stripe account)',
      );
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
    });
    if (!sender)
      throw AppException.NotFound(
        ErrorCode.SENDER_NOT_FOUND,
        'Sender not found',
      );

    const platformFee = Math.floor(amountCents * PLATFORM_FEE_DECIMAL);

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
    if (!user)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

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
      this.logger.error('Stripe Connect Onboarding Error:', error);
      throw AppException.BadRequest(
        ErrorCode.STRIPE_ONBOARDING_FAILED,
        error instanceof Error
          ? error.message
          : 'Failed to connect with Stripe',
      );
    }
  }

  async getAccountStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

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
      this.logger.error('Stripe Get Account Error:', error);
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
    if (!user)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    if (!user.stripeConnectAccountId) {
      throw AppException.BadRequest(
        ErrorCode.STRIPE_CONNECT_NOT_SETUP,
        'Stripe Connect account not set up yet',
      );
    }

    const link = await this.stripeService.createLoginLink(
      user.stripeConnectAccountId,
    );
    return { url: link.url };
  }

  /**
   * Read-only Stripe Connect balance + recent payouts (no internal payout ledger).
   */
  async getConnectPayoutsSummary(userId: string): Promise<{
    available: { amountCents: number; currency: string }[];
    pending: { amountCents: number; currency: string }[];
    payouts: {
      id: string;
      amountCents: number;
      currency: string;
      status: string;
      arrivalDate: string | null;
      createdAt: string;
      method: string;
      type: string;
    }[];
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeConnectAccountId: true },
    });
    if (!user)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');
    if (!user.stripeConnectAccountId) {
      throw AppException.BadRequest(
        ErrorCode.STRIPE_CONNECT_NOT_SETUP,
        'Stripe Connect account not set up yet',
      );
    }

    const [balance, payouts] = await Promise.all([
      this.stripeService.getConnectBalance(user.stripeConnectAccountId),
      this.stripeService.listConnectPayouts(user.stripeConnectAccountId, 10),
    ]);

    const mapAmount = (amounts: { amount: number; currency: string }[]) =>
      amounts.map((a) => ({
        amountCents: a.amount,
        currency: a.currency.toUpperCase(),
      }));

    return {
      available: mapAmount(balance.available),
      pending: mapAmount(balance.pending),
      payouts: payouts.data.map((p) => ({
        id: p.id,
        amountCents: p.amount,
        currency: p.currency.toUpperCase(),
        status: p.status,
        arrivalDate: p.arrival_date
          ? new Date(p.arrival_date * 1000).toISOString()
          : null,
        createdAt: new Date(p.created * 1000).toISOString(),
        method: p.method,
        type: p.type,
      })),
    };
  }

  async getIncomeStats(userId: string) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        receiverId: userId,
        status: 'COMPLETED',
        type: {
          in: [
            'DIRECT_POST_UNLOCK',
            'DIRECT_STORY_UNLOCK',
            'DIRECT_MESSAGE_UNLOCK',
            'DIRECT_TIP',
            'DIRECT_LIVE_GIFT',
          ],
        },
        createdAt: {
          gte: sixMonthsAgo,
        },
      },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    const months = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7); // YYYY-MM
      months.set(key, 0);
    }

    for (const tx of transactions) {
      const key = tx.createdAt.toISOString().slice(0, 7);
      if (months.has(key)) {
        months.set(key, months.get(key)! + tx.amount);
      }
    }

    return Array.from(months.entries()).map(([month, income]) => ({
      month,
      income,
    }));
  }

  async getFinancialSummary(userId: string) {
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const [currentMonthTx, allTimeTipsTx, categoryBreakdown] =
      await Promise.all([
        this.prisma.transaction.aggregate({
          where: {
            receiverId: userId,
            status: 'COMPLETED',
            type: {
              in: [
                'DIRECT_POST_UNLOCK',
                'DIRECT_STORY_UNLOCK',
                'DIRECT_MESSAGE_UNLOCK',
                'DIRECT_TIP',
                'DIRECT_LIVE_GIFT',
              ],
            },
            createdAt: {
              gte: currentMonth,
            },
          },
          _sum: {
            amount: true,
          },
        }),
        this.prisma.transaction.aggregate({
          where: {
            receiverId: userId,
            status: 'COMPLETED',
            type: 'DIRECT_TIP',
          },
          _sum: {
            amount: true,
          },
        }),
        this.prisma.transaction.groupBy({
          by: ['type'],
          where: {
            receiverId: userId,
            status: 'COMPLETED',
          },
          _sum: {
            amount: true,
          },
        }),
      ]);

    const breakdownMap: Record<string, number> = {
      DIRECT_POST_UNLOCK: 0,
      DIRECT_STORY_UNLOCK: 0,
      DIRECT_MESSAGE_UNLOCK: 0,
      DIRECT_TIP: 0,
      DIRECT_LIVE_GIFT: 0,
    };

    for (const item of categoryBreakdown) {
      if (item.type in breakdownMap) {
        breakdownMap[item.type] = item._sum.amount || 0;
      }
    }

    return {
      currentMonthIncome: currentMonthTx._sum.amount || 0,
      totalTips: allTimeTipsTx._sum.amount || 0,
      breakdown: {
        postUnlocks: breakdownMap.DIRECT_POST_UNLOCK,
        storyUnlocks: breakdownMap.DIRECT_STORY_UNLOCK,
        messageUnlocks: breakdownMap.DIRECT_MESSAGE_UNLOCK,
        tips: breakdownMap.DIRECT_TIP,
        liveGifts: breakdownMap.DIRECT_LIVE_GIFT,
      },
    };
  }
}
