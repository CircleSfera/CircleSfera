import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

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

    return this.prisma.$transaction(async (tx) => {
      // Deduct from sender
      await tx.wallet.update({
        where: { userId: senderId },
        data: { balance: { decrement: amount } },
      });

      // Add to receiver's earned tokens
      await tx.wallet.update({
        where: { userId: receiverId },
        data: { earnedTokens: { increment: amount } },
      });

      // Record transaction
      const transaction = await tx.transaction.create({
        data: {
          type: 'TIP',
          amount: amount, // Log the positive amount for receiver, negative for sender in UI logic
          senderId,
          receiverId,
          postId,
          status: 'COMPLETED',
          description: `Tip sent`,
        },
      });

      // Optional: send notification
      await tx.notification.create({
        data: {
          recipientId: receiverId,
          senderId,
          type: 'SUBSCRIPTION', // Repurposing or use a generic notification, ideally create a 'TIP' type in schema later
          content: `You received a ${amount} token tip!`,
          postId,
        },
      });

      return transaction;
    });
  }

  async unlockPost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post || !post.isPremium) {
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
      // Deduct buyer
      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: price } },
      });

      // Pay creator
      await tx.wallet.update({
        where: { userId: post.userId },
        data: { earnedTokens: { increment: price } },
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
          description: `Unlocked premium post`,
        },
      });

      return transaction;
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
