import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// The provider holds the payouts of an account for 90 days at most: the
// balance of a person still banned is released after 85, and the team is
// told ten days before, to refund in the provider what fraud paid.
export const PAYOUT_HOLD_DAYS = 85;
export const PAYOUT_HOLD_WARNING_DAYS = 75;

type Person = {
  id: string;
  isRootBanned: boolean;
  payoutsHeldAt: Date | null;
};

const PERSON_SELECT = {
  id: true,
  isRootBanned: true,
  payoutsHeldAt: true,
} as const;

/**
 * Once a day, every creator account is paid out as its person's standing
 * says: held while the person is banned from the whole account, for 85 days
 * at most, on Mondays otherwise. It covers a hold or a resume the provider
 * refused at the time, and the people banned before payouts were held.
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
  async checkSchedules(now = new Date()): Promise<{
    corrected: string[];
    failed: string[];
  }> {
    const [rows, owners] = await Promise.all([
      this.prisma.monetization.findMany({
        where: { stripeConnectAccountId: { not: null } },
        select: {
          stripeConnectAccountId: true,
          user: { select: PERSON_SELECT },
          profile: { select: { user: { select: PERSON_SELECT } } },
        },
      }),
      this.prisma.user.findMany({
        where: { stripeConnectAccountId: { not: null } },
        select: { ...PERSON_SELECT, stripeConnectAccountId: true },
      }),
    ]);
    // Each account, and its person, once however many accounts they have.
    const accounts = new Map<string, string>();
    const people = new Map<string, Person>();
    const keep = (
      account: string | null,
      person: Person | null | undefined,
    ) => {
      if (!account || !person) return;
      accounts.set(account, person.id);
      if (!people.has(person.id)) people.set(person.id, person);
    };
    for (const { stripeConnectAccountId, ...person } of owners) {
      keep(stripeConnectAccountId, person);
    }
    for (const row of rows) {
      keep(row.stripeConnectAccountId, row.user ?? row.profile?.user);
    }

    const warned: string[] = [];
    for (const person of people.values()) {
      if (!person.isRootBanned) continue;
      if (!person.payoutsHeldAt) {
        // Banned before payouts were held: the 85 days count from today.
        person.payoutsHeldAt = now;
        await this.prisma.user.update({
          where: { id: person.id },
          data: { payoutsHeldAt: now },
        });
      }
      const days = Math.floor(
        (now.getTime() - person.payoutsHeldAt.getTime()) / DAY_MS,
      );
      if (days === PAYOUT_HOLD_WARNING_DAYS) warned.push(person.id);
    }

    const corrected: string[] = [];
    const failed: string[] = [];
    for (const [account, personId] of accounts) {
      const person = people.get(personId) as Person;
      const held =
        person.isRootBanned &&
        !!person.payoutsHeldAt &&
        now.getTime() - person.payoutsHeldAt.getTime() <
          PAYOUT_HOLD_DAYS * DAY_MS;
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
    if (warned.length > 0) {
      this.eventEmitter.emit('system.incident', {
        message: `The held payouts of ${warned.length} banned person(s) are released in ${PAYOUT_HOLD_DAYS - PAYOUT_HOLD_WARNING_DAYS} days: ${warned.slice(0, 10).join(', ')}. Refund in Stripe what fraud paid before then.`,
        path: 'stripe://payout-schedule',
        statusCode: 409,
        timestamp: now.toISOString(),
      });
    }
    if (failed.length > 0) {
      this.eventEmitter.emit('system.incident', {
        message: `The payout schedule of ${failed.length} creator account(s) could not be checked: ${failed.slice(0, 10).join(', ')}`,
        path: 'stripe://payout-schedule',
        statusCode: 502,
        timestamp: now.toISOString(),
      });
    }
    return { corrected, failed };
  }
}
