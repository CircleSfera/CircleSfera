import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type { Job, Queue } from 'bullmq';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

@Processor('users-processing')
export class AccountDeletionProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountDeletionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly stripeService: StripeService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('users-processing') private readonly usersQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'clean-expired-search-history':
        return this.cleanExpiredSearchHistory();
      case 'clean-expired-accounts':
        return this.cleanExpiredAccounts();
      case 'hard-delete-user':
        return this.hardDeleteUser(job.data.userId);
      default:
        return undefined;
    }
  }

  async cleanExpiredSearchHistory() {
    this.logger.log('Starting daily purge of expired SearchHistory...');
    try {
      const result = await this.prisma.searchHistory.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
      this.logger.log(`Purged ${result.count} expired search history records.`);
    } catch (error) {
      this.logger.error('Failed to purge expired search history', error);
    }
  }

  async cleanExpiredAccounts() {
    this.logger.log('Starting daily purge of expired Accounts...');
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const expiredUsers = await this.prisma.user.findMany({
        where: {
          OR: [
            { scheduledDeletionAt: { not: null, lte: now } },
            {
              scheduledDeletionAt: null,
              deletedAt: { not: null, lt: thirtyDaysAgo },
            },
          ],
        } satisfies Prisma.UserWhereInput,
        select: { id: true },
      });

      let queuedCount = 0;
      for (const user of expiredUsers) {
        await this.usersQueue.add(
          'hard-delete-user',
          { userId: user.id },
          { jobId: `delete-${user.id}` },
        );
        queuedCount++;
      }

      this.logger.log(
        `Queued ${queuedCount} expired user accounts for hard deletion.`,
      );
    } catch (error) {
      this.logger.error('Failed to purge expired accounts', error);
    }
  }

  async hardDeleteUser(userId: string) {
    this.logger.log(`Executing hard delete for user ${userId}`);
    try {
      // Phase 1: Gather resources
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        this.logger.warn(
          `User ${userId} not found during hard delete. Ignored.`,
        );
        return;
      }

      // Phase 2: Stripe Cleanup
      if (user.stripeCustomerId) {
        try {
          const subs = await this.stripeService.stripe.subscriptions.list({
            customer: user.stripeCustomerId,
          });
          for (const sub of subs.data) {
            await this.stripeService.stripe.subscriptions.cancel(sub.id);
            this.logger.log(
              `Canceled Stripe subscription ${sub.id} for user ${userId}`,
            );
          }
        } catch (stripeError) {
          this.logger.error(
            `Failed to cancel Stripe subscriptions for user ${userId}`,
            stripeError,
          );
        }
      }

      // Phase 3: Event Emission (Decoupling)
      this.logger.log(`Emitting user.hard_deleted event for user ${userId}...`);
      this.eventEmitter.emit('user.hard_deleted', { userId });

      // Phase 4: Database Deletion
      await this.usersService.deleteUser(userId);
      this.logger.log(`Successfully hard deleted user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to hard delete user ${userId}`, error);
      throw error;
    }
  }
}
