import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: DI needs value
import { PrismaService } from '../prisma/prisma.service.js';
// biome-ignore lint/style/useImportType: DI needs value
import { WalletService } from '../wallet/wallet.service.js';

@Injectable()
export class CreatorSubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
  ) {}

  async subscribe(
    subscriberId: string,
    creatorId: string,
    monthlyTokens: number,
  ) {
    if (subscriberId === creatorId) {
      throw new BadRequestException('Cannot subscribe to yourself');
    }

    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
    });
    if (!creator) throw new NotFoundException('Creator not found');

    const existing = await this.prisma.creatorSubscription.findUnique({
      where: { subscriberId_creatorId: { subscriberId, creatorId } },
    });

    if (
      existing &&
      existing.status === 'ACTIVE' &&
      existing.expiresAt > new Date()
    ) {
      return { success: true, message: 'Already subscribed' };
    }

    const wallet = await this.walletService.getWallet(subscriberId);
    if (wallet.balance < monthlyTokens) {
      throw new BadRequestException('Insufficient tokens for subscription');
    }

    return this.prisma.$transaction(async (tx) => {
      // Deduct tokens
      await tx.wallet.update({
        where: { userId: subscriberId },
        data: { balance: { decrement: monthlyTokens } },
      });

      // Give to creator
      await tx.wallet.update({
        where: { userId: creatorId },
        data: { earnedTokens: { increment: monthlyTokens } },
      });

      // Log transaction
      await tx.transaction.create({
        data: {
          type: 'SUBSCRIPTION',
          amount: monthlyTokens,
          senderId: subscriberId,
          receiverId: creatorId,
          description: `Subscription to ${creator.email}`,
        },
      });

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      // Upsert subscription
      const subscription = await tx.creatorSubscription.upsert({
        where: { subscriberId_creatorId: { subscriberId, creatorId } },
        create: {
          subscriberId,
          creatorId,
          monthlyTokens,
          status: 'ACTIVE',
          expiresAt,
        },
        update: {
          status: 'ACTIVE',
          expiresAt,
          monthlyTokens,
        },
      });

      // Send Notification
      await tx.notification.create({
        data: {
          recipientId: creatorId,
          senderId: subscriberId,
          type: 'SUBSCRIPTION',
          content: 'You have a new subscriber!',
        },
      });

      return subscription;
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
}
