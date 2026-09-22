import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PromotionRefundPolicy, PromotionStatus } from '@prisma/client';
import { eurosToCents } from '../../../../common/constants/monetization.constants.js';
import { StripeService } from '../../../../common/stripe/stripe.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { RefundPromotionUseCase } from './refund-promotion.use-case.js';

// Prisma row + money fields (guards IDE lag after cents migration).
type PromotionRow = Awaited<
  ReturnType<PrismaService['promotion']['findFirstOrThrow']>
> & {
  budgetCents: number;
  dailyBudgetCents: number | null;
};

@Injectable()
export class ManagePromotionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeService) private readonly stripeService: StripeService,
    @Inject(RefundPromotionUseCase)
    private readonly refundPromotionUseCase: RefundPromotionUseCase,
  ) {}

  private asRow(
    promo: Awaited<ReturnType<PrismaService['promotion']['findFirstOrThrow']>>,
  ): PromotionRow {
    return promo as PromotionRow;
  }

  private async requireOwnedPromotion(userId: string, promotionId: string) {
    const promo = await this.prisma.promotion.findFirst({
      where: { id: promotionId, userId },
    });
    if (!promo) {
      throw new NotFoundException('Promotion not found');
    }
    return this.asRow(promo);
  }

  async pausePromotion(userId: string, promotionId: string) {
    const promo = await this.requireOwnedPromotion(userId, promotionId);

    if (promo.status === PromotionStatus.PAUSED) {
      return promo;
    }
    if (promo.status !== PromotionStatus.ACTIVE) {
      throw new BadRequestException('Only active promotions can be paused');
    }
    if (promo.endDate <= new Date()) {
      throw new BadRequestException('Cannot pause an expired promotion');
    }

    return this.asRow(
      await this.prisma.promotion.update({
        where: { id: promotionId },
        data: { status: PromotionStatus.PAUSED },
      }),
    );
  }

  async resumePromotion(userId: string, promotionId: string) {
    const promo = await this.requireOwnedPromotion(userId, promotionId);

    if (promo.status === PromotionStatus.ACTIVE) {
      return promo;
    }
    if (promo.status !== PromotionStatus.PAUSED) {
      throw new BadRequestException('Only paused promotions can be resumed');
    }
    if (promo.endDate <= new Date()) {
      throw new BadRequestException('Cannot resume an expired promotion');
    }
    if (promo.budgetCents <= 0) {
      throw new BadRequestException('Cannot resume a promotion with no budget');
    }

    return this.asRow(
      await this.prisma.promotion.update({
        where: { id: promotionId },
        data: { status: PromotionStatus.ACTIVE },
      }),
    );
  }

  async cancelPromotion(userId: string, promotionId: string) {
    const promo = await this.requireOwnedPromotion(userId, promotionId);

    if (promo.status === PromotionStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed promotion');
    }
    if (promo.status === PromotionStatus.CANCELLED) {
      return {
        ...promo,
        refund: {
          amountCents: 0,
          amount: 0,
          currency: promo.currency,
          status: promo.refundedAt ? 'already_refunded' : 'none',
        },
      };
    }
    if (
      promo.status !== PromotionStatus.ACTIVE &&
      promo.status !== PromotionStatus.PAUSED &&
      promo.status !== PromotionStatus.PENDING
    ) {
      throw new BadRequestException(
        `Cannot cancel promotion in status ${promo.status}`,
      );
    }

    let refundResult: {
      amountCents: number;
      amount: number;
      currency: string;
      status: 'succeeded' | 'skipped_policy' | 'skipped_unpaid' | 'none';
    } = { amountCents: 0, amount: 0, currency: promo.currency, status: 'none' };

    if (
      promo.status === PromotionStatus.PENDING &&
      promo.stripePaymentIntentId
    ) {
      try {
        await this.stripeService.expireCheckoutSession(
          promo.stripePaymentIntentId,
        );
      } catch (_err) {
        // Ignore
      }
    }

    const wasCharged =
      promo.status === PromotionStatus.ACTIVE ||
      promo.status === PromotionStatus.PAUSED ||
      Boolean(promo.chargedAt);

    // Delegates the actual Stripe refund + Transaction ledger write to
    // RefundPromotionUseCase (also used by admin promotion rejection) so
    // there is exactly one place that decides how a promotion refund moves
    // money and records it — previously this block duplicated that logic
    // inline and, unlike RefundPromotionUseCase, never wrote a Transaction
    // row for the refund.
    if (promo.refundPolicy === PromotionRefundPolicy.NONE) {
      refundResult = {
        amountCents: 0,
        amount: 0,
        currency: promo.currency,
        status: 'skipped_policy',
      };
    } else if (wasCharged && !promo.refundedAt && promo.stripePaymentIntentId) {
      try {
        const result = await this.refundPromotionUseCase.execute(
          promotionId,
          'user-cancel',
        );
        if (result.refunded) {
          const cents = Math.round(result.amount * 100);
          refundResult = {
            amountCents: cents,
            amount: result.amount,
            currency: result.currency,
            status: 'succeeded',
          };
        } else if (result.reason === 'skipped_unpaid') {
          refundResult = {
            amountCents: 0,
            amount: 0,
            currency: promo.currency,
            status: 'skipped_unpaid',
          };
        }
        // 'not_charged' / 'no_remaining_budget' / 'already_refunded' /
        // 'policy_none': nothing to refund — refundResult stays 'none'.
      } catch (_err) {
        throw new BadRequestException(
          'Could not process refund. Promotion was not cancelled; please retry.',
        );
      }
    }

    const updated = this.asRow(
      await this.prisma.promotion.update({
        where: { id: promotionId },
        data: {
          status: PromotionStatus.CANCELLED,
          endDate: new Date(),
          ...(refundResult.status === 'succeeded'
            ? { refundedAt: new Date() }
            : {}),
        },
      }),
    );

    return { ...updated, refund: refundResult };
  }

  async updatePromotion(
    userId: string,
    promotionId: string,
    data: {
      objective?: string;
      interests?: string;
      countries?: string;
      endDate?: string;
      dailyBudget?: number;
      dailyBudgetCents?: number;
    },
  ) {
    const promo = await this.requireOwnedPromotion(userId, promotionId);
    if (
      promo.status !== PromotionStatus.ACTIVE &&
      promo.status !== PromotionStatus.PENDING &&
      promo.status !== PromotionStatus.PAUSED
    ) {
      throw new BadRequestException(
        'Only active, paused, or pending promotions can be edited',
      );
    }

    let endDate: Date | undefined;
    if (data.endDate) {
      endDate = new Date(data.endDate);
      if (Number.isNaN(endDate.getTime()) || endDate <= new Date()) {
        throw new BadRequestException('endDate must be a future date');
      }
    }

    const dailyBudgetCents =
      data.dailyBudgetCents !== undefined
        ? data.dailyBudgetCents
        : data.dailyBudget !== undefined
          ? eurosToCents(data.dailyBudget)
          : undefined;

    return this.asRow(
      await this.prisma.promotion.update({
        where: { id: promotionId },
        data: {
          ...(data.objective !== undefined
            ? { objective: data.objective }
            : {}),
          ...(data.interests !== undefined
            ? { interests: data.interests }
            : {}),
          ...(data.countries !== undefined
            ? { countries: data.countries }
            : {}),
          ...(dailyBudgetCents !== undefined ? { dailyBudgetCents } : {}),
          ...(endDate ? { endDate } : {}),
        },
      }),
    );
  }
}
