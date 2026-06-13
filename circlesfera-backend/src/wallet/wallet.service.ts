import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI needs the value for metadata reflection
import { NotificationsService } from '../notifications/notifications.service.js';
// biome-ignore lint/style/useImportType: NestJS DI needs the value for metadata reflection
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { userId },
      });
    }
    return wallet;
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

  // Simulate purchasing tokens via Stripe
  async purchaseTokens(userId: string, amount: number) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    await this.getWallet(userId); // ensure wallet exists

    return this.prisma.$transaction(async (tx) => {
      // 1. Add balance
      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: amount } },
      });

      // 2. Log transaction
      const transaction = await tx.transaction.create({
        data: {
          type: 'TOKEN_PURCHASE',
          amount: amount,
          receiverId: userId,
          status: 'COMPLETED',
          description: `Purchased ${amount} tokens`,
        },
      });

      return { wallet, transaction };
    });
  }

  async sendTip(
    senderId: string,
    receiverId: string,
    amount: number,
    postId?: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Invalid tip amount');
    if (senderId === receiverId)
      throw new BadRequestException('Cannot tip yourself');

    const senderWallet = await this.getWallet(senderId);
    await this.getWallet(receiverId);

    if (senderWallet.balance < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Platform takes 20% commission
      const platformCommission = Math.floor(amount * 0.20);
      const creatorEarnings = amount - platformCommission;

      // Deduct full amount from sender
      await tx.wallet.update({
        where: { userId: senderId },
        data: { balance: { decrement: amount } },
      });

      // Add 80% to receiver's earned tokens
      await tx.wallet.update({
        where: { userId: receiverId },
        data: { earnedTokens: { increment: creatorEarnings } },
      });

      // Record transaction
      const transaction = await tx.transaction.create({
        data: {
          type: 'TIP',
          amount: amount, 
          senderId,
          receiverId,
          postId,
          status: 'COMPLETED',
          description: `Tip sent. Creator received ${creatorEarnings} tokens.`,
        },
      });

      return transaction;
    });

    // Send realtime notification outside the transaction
    await this.notificationsService.create({
      recipientId: receiverId,
      senderId,
      type: 'LIKE', // Ideally create a TIP type in NotificationType enum later
      content: `sent you a ${amount} token tip!`,
      postId,
    });

    return result;
  }

  async unlockPost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post?.isPremium) {
      throw new NotFoundException('Premium post not found');
    }

    if (post.userId === userId) {
      throw new BadRequestException('You own this post');
    }

    // Check if already unlocked
    const existingTx = await this.prisma.transaction.findFirst({
      where: {
        type: 'POST_UNLOCK',
        senderId: userId,
        postId: postId,
        status: 'COMPLETED',
      },
    });

    if (existingTx) {
      return { success: true, message: 'Already unlocked' };
    }

    const price = post.price;
    const wallet = await this.getWallet(userId);

    if (wallet.balance < price) {
      throw new BadRequestException('Insufficient tokens to unlock this post');
    }

    return this.prisma.$transaction(async (tx) => {
      // Platform takes 20% commission
      const platformCommission = Math.floor(price * 0.20);
      const creatorEarnings = price - platformCommission;

      // Deduct full price from buyer
      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: price } },
      });

      // Pay creator 80%
      await tx.wallet.update({
        where: { userId: post.userId },
        data: { earnedTokens: { increment: creatorEarnings } },
      });

      // Log transaction
      const transaction = await tx.transaction.create({
        data: {
          type: 'POST_UNLOCK',
          amount: price,
          senderId: userId,
          receiverId: post.userId,
          postId: postId,
          status: 'COMPLETED',
          description: `Unlocked premium post. Creator received ${creatorEarnings} tokens.`,
        },
      });

      return transaction;
    });
  }

  async subscribeToCreator(
    subscriberId: string,
    creatorId: string,
    monthlyTokens: number,
  ) {
    if (subscriberId === creatorId) {
      throw new BadRequestException('Cannot subscribe to yourself');
    }
    if (monthlyTokens <= 0) {
      throw new BadRequestException('Invalid subscription amount');
    }

    const wallet = await this.getWallet(subscriberId);
    if (wallet.balance < monthlyTokens) {
      throw new BadRequestException('Insufficient tokens to subscribe');
    }

    // Check if already actively subscribed
    const existingSub = await this.prisma.creatorSubscription.findUnique({
      where: {
        subscriberId_creatorId: { subscriberId, creatorId },
      },
    });

    if (existingSub && existingSub.expiresAt > new Date()) {
      throw new BadRequestException('Already subscribed to this creator');
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    return this.prisma.$transaction(async (tx) => {
      // Platform takes 20% commission
      const platformCommission = Math.floor(monthlyTokens * 0.20);
      const creatorEarnings = monthlyTokens - platformCommission;

      // Deduct from subscriber
      await tx.wallet.update({
        where: { userId: subscriberId },
        data: { balance: { decrement: monthlyTokens } },
      });

      // Pay creator 80%
      await tx.wallet.update({
        where: { userId: creatorId },
        data: { earnedTokens: { increment: creatorEarnings } },
      });

      // Create or update subscription
      const subscription = await tx.creatorSubscription.upsert({
        where: {
          subscriberId_creatorId: { subscriberId, creatorId },
        },
        update: {
          status: 'ACTIVE',
          expiresAt,
          monthlyTokens,
        },
        create: {
          subscriberId,
          creatorId,
          monthlyTokens,
          expiresAt,
          status: 'ACTIVE',
        },
      });

      // Log transaction
      await tx.transaction.create({
        data: {
          type: 'SUBSCRIPTION',
          amount: monthlyTokens,
          senderId: subscriberId,
          receiverId: creatorId,
          status: 'COMPLETED',
          description: `Subscribed to creator. Creator received ${creatorEarnings} tokens.`,
        },
      });

      return subscription;
    });
  }

  async requestPayout(
    userId: string,
    amountTokens: number,
    payoutMethod: string,
    payoutDetails: string,
  ) {
    if (amountTokens < 1000) {
      throw new BadRequestException('Minimum payout is 1000 tokens');
    }

    const wallet = await this.getWallet(userId);
    if (wallet.earnedTokens < amountTokens) {
      throw new BadRequestException('Insufficient earned tokens for payout');
    }

    // Rough conversion rate, e.g. 100 tokens = $1.00 -> 1 token = 0.01
    const amountFiat = amountTokens * 0.01;

    return this.prisma.$transaction(async (tx) => {
      // Deduct from earned tokens immediately
      await tx.wallet.update({
        where: { userId },
        data: { earnedTokens: { decrement: amountTokens } },
      });

      // Create request
      const request = await tx.payoutRequest.create({
        data: {
          userId,
          amountTokens,
          amountFiat,
          currency: 'USD',
          payoutMethod,
          payoutDetails,
          status: 'PENDING',
        },
      });

      // Log transaction as PENDING payout
      await tx.transaction.create({
        data: {
          type: 'PAYOUT',
          amount: amountTokens,
          senderId: userId,
          status: 'PENDING',
          description: `Payout request for $${amountFiat}`,
        },
      });

      return request;
    });
  }
}
