import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Once a day, every creator account is paid out as its person's standing
 * says: held while the person is banned from the whole account, on Mondays
 * otherwise. It covers a hold or a resume the provider refused at the time,
 * and the people banned before payouts were held.
 */
@Injectable()
export class PayoutScheduleCheckService {
  private readonly logger = new Logger(PayoutScheduleCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async checkSchedules(): Promise<{ corrected: string[]; failed: string[] }> {
    const [rows, people] = await Promise.all([
      this.prisma.monetization.findMany({
        where: { stripeConnectAccountId: { not: null } },
        select: {
          stripeConnectAccountId: true,
          user: { select: { isRootBanned: true } },
          profile: { select: { user: { select: { isRootBanned: true } } } },
        },
      }),
      this.prisma.user.findMany({
        where: { stripeConnectAccountId: { not: null } },
        select: { stripeConnectAccountId: true, isRootBanned: true },
      }),
    ]);
    // Each account, and whether its person is banned.
    const banned = new Map<string, boolean>();
    for (const person of people) {
      if (person.stripeConnectAccountId) {
        banned.set(person.stripeConnectAccountId, person.isRootBanned);
      }
    }
    for (const row of rows) {
      const person = row.user ?? row.profile?.user;
      if (row.stripeConnectAccountId && person) {
        banned.set(row.stripeConnectAccountId, person.isRootBanned);
      }
    }

    const corrected: string[] = [];
    const failed: string[] = [];
    for (const [account, held] of banned) {
      try {
        const { settings } = await this.stripeService.getAccount(account);
        const isHeld = settings?.payouts?.schedule?.interval === 'manual';
        if (isHeld === held) continue;
        await this.stripeService.setPayoutsHeld(account, held);
        corrected.push(account);
      } catch (error) {
        failed.push(account);
        this.logger.error(
          `Could not check the payout schedule of account ${account}`,
          error,
        );
      }
    }

    if (corrected.length > 0) {
      this.logger.log(
        `Payout schedule set again for ${corrected.length} account(s): ${corrected.join(', ')}`,
      );
    }
    if (failed.length > 0) {
      this.eventEmitter.emit('system.incident', {
        message: `The payout schedule of ${failed.length} creator account(s) could not be checked: ${failed.slice(0, 10).join(', ')}`,
        path: 'stripe://payout-schedule',
        statusCode: 502,
        timestamp: new Date().toISOString(),
      });
    }
    return { corrected, failed };
  }
}
