import { ErrorCode } from '@circlesfera/shared';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import {
  INSTANT_PAYOUT_DISPUTE_FREE_DAYS,
  INSTANT_PAYOUT_MIN_DAYS_SINCE_FIRST_SALE,
  INSTANT_PAYOUT_MIN_SALES,
  instantPayoutFeeCents,
} from '../common/constants/monetization.constants.js';
import { AppException } from '../common/errors/app.exception.js';
import { assertRealMoneyAllowed } from '../common/policies/test-account.policy.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateInstantPayoutDto,
  InstantPayoutOfferDto,
  InstantPayoutQuoteDto,
  InstantPayoutResultDto,
  InstantPayoutTrackRecordDto,
  InstantPayoutUnavailableReason,
} from './dto/instant-payout.dto.js';
import { INCOME_ROWS_SQL } from './earnings-sql.js';
import { CLOSED_DISPUTE_STATUSES } from './monetization-webhook.service.js';
import { canBePaid, PAYABLE_PROFILE_SELECT } from './payout-account.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// The fee the provider takes may differ by a cent from CircleSfera's own
// reckoning, as the two round on their own.
const FEE_ROUNDING_CENTS = 1;

type Evaluation =
  | {
      available: false;
      reason: InstantPayoutUnavailableReason;
      trackRecord: InstantPayoutTrackRecordDto | null;
    }
  | {
      available: true;
      accountId: string;
      destination: string;
      trackRecord: InstantPayoutTrackRecordDto;
      quote: InstantPayoutQuoteDto;
    };

/**
 * Whether a track record is enough for an instant payout: long enough since
 * the first sale, enough sales, and no dispute in the window.
 */
export function hasTrackRecord(record: InstantPayoutTrackRecordDto): boolean {
  return (
    record.daysSinceFirstSale !== null &&
    record.daysSinceFirstSale >= record.minDaysSinceFirstSale &&
    record.sales >= record.minSales &&
    !record.disputedRecently
  );
}

/**
 * Instant payouts: a creator with a track record takes the balance of the
 * active Profile's own payout account out at once, for a fee, instead of
 * waiting for the Monday payout. CircleSfera decides who may, checks again
 * before every payout, and asks the provider for it; the provider takes the
 * fee and stays the record of the payout, which its webhook logs like the
 * weekly ones.
 */
@Injectable()
export class InstantPayoutService {
  private readonly logger = new Logger(InstantPayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  async getOffer(
    userId: string,
    profileId: string,
  ): Promise<InstantPayoutOfferDto> {
    const evaluation = await this.evaluate(userId, profileId);
    return {
      available: evaluation.available,
      reason: evaluation.available ? null : evaluation.reason,
      trackRecord: evaluation.trackRecord,
      quote: evaluation.available ? evaluation.quote : null,
    };
  }

  async payOut(
    userId: string,
    profileId: string,
    request: CreateInstantPayoutDto,
  ): Promise<InstantPayoutResultDto> {
    const evaluation = await this.evaluate(userId, profileId);
    if (!evaluation.available) {
      throw AppException.BadRequest(
        ErrorCode.INSTANT_PAYOUT_NOT_AVAILABLE,
        'Instant payout not available',
      );
    }
    const { accountId, destination, quote } = evaluation;
    if (quote.netCents !== request.netCents) {
      throw new AppException(
        ErrorCode.INSTANT_PAYOUT_AMOUNT_CHANGED,
        HttpStatus.CONFLICT,
        'The instant payout amount changed',
      );
    }

    try {
      const payout = await this.stripeService.createInstantPayout(accountId, {
        amountCents: quote.netCents,
        currency: quote.currency.toLowerCase(),
        destination,
        idempotencyKey: `instant-payout:${accountId}:${request.idempotencyKey}`,
      });
      this.logger.log(
        `Instant payout ${payout.id} of ${payout.amount} ${payout.currency} for Profile ${profileId}`,
      );
      return {
        currency: payout.currency.toUpperCase(),
        netCents: payout.amount,
        arrivalDate: payout.arrival_date
          ? new Date(payout.arrival_date * 1000).toISOString()
          : null,
      };
    } catch (error) {
      // A request the provider refuses (the balance moved, the bank account
      // takes no instant payouts, the key was used for another amount) is
      // answered as not available; anything else is the server's.
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        this.logger.warn(
          `Instant payout refused by the provider for Profile ${profileId}: ${error.code ?? error.message}`,
        );
        throw AppException.BadRequest(
          ErrorCode.INSTANT_PAYOUT_NOT_AVAILABLE,
          'Instant payout not available',
        );
      }
      throw error;
    }
  }

  // Every rule, cheapest first: the account, the Profile's standing, open
  // disputes, the track record, then what the provider says.
  private async evaluate(
    userId: string,
    profileId: string,
    now = new Date(),
  ): Promise<Evaluation> {
    const unavailable = (
      reason: InstantPayoutUnavailableReason,
      trackRecord: InstantPayoutTrackRecordDto | null = null,
    ): Evaluation => ({ available: false, reason, trackRecord });

    // Only the Profile's own payout account: the one it holds, whether it is
    // the person's account or one of the Profile's own.
    const row = await this.prisma.monetization.findUnique({
      where: { profileId },
      select: { stripeConnectAccountId: true },
    });
    const accountId = row?.stripeConnectAccountId;
    if (!accountId) return unavailable('NO_ACCOUNT');

    try {
      await assertRealMoneyAllowed(this.prisma, userId);
    } catch {
      return unavailable('RESTRICTED');
    }

    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { userId: true, ...PAYABLE_PROFILE_SELECT },
    });
    if (!profile || profile.userId !== userId || !canBePaid(profile)) {
      return unavailable('RESTRICTED');
    }

    const trackRecord = await this.trackRecord(userId, profileId, now);

    // A dispute still open on any payment the person received, whichever
    // Profile received it: its money may sit in this account.
    const openDisputes = await this.prisma.paymentDispute.count({
      where: {
        status: { notIn: [...CLOSED_DISPUTE_STATUSES] },
        transaction: { receiverId: userId },
      },
    });
    if (openDisputes > 0) return unavailable('DISPUTE_OPEN', trackRecord);

    if (!hasTrackRecord(trackRecord)) {
      return unavailable('TRACK_RECORD', trackRecord);
    }

    let account: Stripe.Account;
    try {
      account = await this.stripeService.getAccount(accountId);
    } catch (error) {
      this.logger.error(`Could not read account ${accountId}`, error);
      return unavailable('UNAVAILABLE', trackRecord);
    }
    // Held payouts (a banned person, or held by hand) stay held.
    if (
      !account.payouts_enabled ||
      account.settings?.payouts?.schedule?.interval === 'manual'
    ) {
      return unavailable('RESTRICTED', trackRecord);
    }

    let balances: Awaited<ReturnType<StripeService['getInstantPayoutBalance']>>;
    try {
      balances = await this.stripeService.getInstantPayoutBalance(accountId);
    } catch (error) {
      this.logger.error(
        `Could not read the instant balance of account ${accountId}`,
        error,
      );
      return unavailable('UNAVAILABLE', trackRecord);
    }

    // The account's own currency first, then the largest amount reaching
    // one of its bank accounts or cards.
    const currency = account.default_currency ?? 'eur';
    const balance =
      balances.find((entry) => entry.currency === currency) ?? balances[0];
    const best = balance?.net.reduce<
      { destination: string; amountCents: number } | undefined
    >(
      (top, net) => (!top || net.amountCents > top.amountCents ? net : top),
      undefined,
    );
    if (!balance || !best || best.amountCents <= 0) {
      return unavailable('NO_BALANCE', trackRecord);
    }

    // The provider takes the fee set in its platform pricing. Until that is
    // CircleSfera's price, no instant payout is offered: one for less would
    // leave the cost of it with the platform.
    const feeCents = balance.amountCents - best.amountCents;
    if (
      feeCents <
      instantPayoutFeeCents(balance.amountCents) - FEE_ROUNDING_CENTS
    ) {
      this.logger.error(
        `The provider's fee for instant payouts (${feeCents} on ${balance.amountCents}) is below CircleSfera's price; set its platform pricing`,
      );
      return unavailable('UNAVAILABLE', trackRecord);
    }

    return {
      available: true,
      accountId,
      destination: best.destination,
      trackRecord,
      quote: {
        currency: balance.currency.toUpperCase(),
        amountCents: balance.amountCents,
        feeCents,
        netCents: best.amountCents,
      },
    };
  }

  // The Profile's own sales: the completed payments of an income kind it
  // received, the first of them, and whether one was disputed lately. An
  // inquiry the bank opens before any dispute does not count as one.
  private async trackRecord(
    userId: string,
    profileId: string,
    now: Date,
  ): Promise<InstantPayoutTrackRecordDto> {
    const [sales] = await this.prisma.$queryRaw<
      { firstSale: Date | null; count: number }[]
    >`
      SELECT MIN(t."createdAt") AS "firstSale", COUNT(*)::int AS count
      FROM transactions t
      WHERE ${INCOME_ROWS_SQL(userId)} AND t."receiverProfileId" = ${profileId}`;
    const recentDisputes = await this.prisma.paymentDispute.count({
      where: {
        openedAt: {
          gte: new Date(
            now.getTime() - INSTANT_PAYOUT_DISPUTE_FREE_DAYS * DAY_MS,
          ),
        },
        NOT: { status: { startsWith: 'warning_' } },
        transaction: { receiverProfileId: profileId },
      },
    });
    const firstSale = sales?.firstSale ?? null;
    return {
      minDaysSinceFirstSale: INSTANT_PAYOUT_MIN_DAYS_SINCE_FIRST_SALE,
      daysSinceFirstSale: firstSale
        ? Math.floor((now.getTime() - firstSale.getTime()) / DAY_MS)
        : null,
      minSales: INSTANT_PAYOUT_MIN_SALES,
      sales: Number(sales?.count ?? 0),
      disputeFreeDays: INSTANT_PAYOUT_DISPUTE_FREE_DAYS,
      disputedRecently: recentDisputes > 0,
    };
  }
}
