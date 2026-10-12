import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

// The recurring monthly income of a set of subscriptions: the list price of
// the plan of each one, in integer cents. One rule for the figure shown now
// and for the one kept each day.
export function recurringIncomeCents(
  subscriptions: { plan?: { priceCents?: number | null } | null }[],
): number {
  return subscriptions.reduce(
    (sum, subscription) => sum + (subscription.plan?.priceCents ?? 0),
    0,
  );
}

const MAX_DAYS = 90;

// Keeps the recurring monthly income once a day, and reads the days kept.
@Injectable()
export class RecurringIncomeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RecurringIncomeService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async current() {
    const subscriptions = await this.prisma.platformSubscription.findMany({
      where: { status: 'ACTIVE' },
      select: { plan: { select: { priceCents: true } } },
    });
    return {
      mrrCents: recurringIncomeCents(subscriptions),
      activeSubscriptions: subscriptions.length,
    };
  }

  // The first day is kept when the server starts, not a day later.
  async onApplicationBootstrap() {
    await this.keepToday();
  }

  // Keeps the figure of today (UTC). A day kept twice is one row. A failure
  // is logged and loses that day only.
  @Cron('5 0 * * *', { timeZone: 'UTC' })
  async keepToday() {
    try {
      const figure = await this.current();
      const day = new Date(new Date().toISOString().slice(0, 10));
      await this.prisma.recurringIncomeDay.upsert({
        where: { day },
        create: { day, ...figure },
        update: figure,
      });
    } catch (error) {
      this.logger.error('The recurring income of today was not kept', error);
    }
  }

  // The days kept, newest first.
  async history(days = 30) {
    const take = Math.min(Math.max(Math.trunc(days) || 30, 1), MAX_DAYS);
    const rows = await this.prisma.recurringIncomeDay.findMany({
      orderBy: { day: 'desc' },
      take,
      select: { day: true, mrrCents: true, activeSubscriptions: true },
    });
    return {
      days: rows.map((row) => ({
        day: row.day.toISOString().slice(0, 10),
        mrrCents: row.mrrCents,
        activeSubscriptions: row.activeSubscriptions,
      })),
    };
  }
}
