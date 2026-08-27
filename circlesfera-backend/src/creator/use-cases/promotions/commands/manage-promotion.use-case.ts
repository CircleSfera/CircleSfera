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

/** Prisma row + money fields (guards IDE lag after cents migration). */
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
        // ignore
      }
    }

    const wasCharged =
      promo.status === PromotionStatus.ACTIVE ||
      promo.status === PromotionStatus.PAUSED ||
      Boolean(promo.chargedAt);

    if (
      wasCharged &&
      promo.refundPolicy === PromotionRefundPolicy.PROPORTIONAL &&
      !promo.refundedAt &&
      promo.stripePaymentIntentId
    ) {
      const amountInCents = Math.max(0, promo.budgetCents);
      if (amountInCents > 0) {
        try {
          const refund =
            await this.stripeService.createRefundFromCheckoutSession({
              checkoutSessionId: promo.stripePaymentIntentId,
              amountInCents,
              idempotencyKey: `promotion-cancel-refund-${promotionId}`,
              metadata: {
                promotionId,
                userId,
                type: 'PROMOTION_CANCEL',
              },
            });

          if (refund) {
            const cents = refund.amount || amountInCents;
            refundResult = {
              amountCents: cents,
              amount: cents / 100,
              currency: (refund.currency || promo.currency).toUpperCase(),
              status: 'succeeded',
            };
          } else {
            refundResult = {
              amountCents: 0,
              amount: 0,
              currency: promo.currency,
              status: 'skipped_unpaid',
            };
          }
        } catch (_err) {
          throw new BadRequestException(
            'Could not process refund. Promotion was not cancelled; please retry.',
          );
        }
      }
    } else if (promo.refundPolicy === PromotionRefundPolicy.NONE) {
      refundResult = {
        amountCents: 0,
        amount: 0,
        currency: promo.currency,
        status: 'skipped_policy',
      };
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
