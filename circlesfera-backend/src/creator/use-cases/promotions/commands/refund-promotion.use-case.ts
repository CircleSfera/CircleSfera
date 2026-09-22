import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PromotionRefundPolicy } from '@prisma/client';
import { StripeService } from '../../../../common/stripe/stripe.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

export type RefundPromotionResult =
  | { refunded: true; amount: number; currency: string }
  | {
      refunded: false;
      reason:
        | 'already_refunded'
        | 'policy_none'
        | 'not_charged'
        | 'no_remaining_budget'
        | 'skipped_unpaid';
    };

@Injectable()
export class RefundPromotionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeService) private readonly stripeService: StripeService,
  ) {}

  async execute(
    promotionId: string,
    reason: string,
  ): Promise<RefundPromotionResult> {
    const promo = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
    });
    if (!promo) {
      throw new NotFoundException('Promotion not found');
    }
    if (promo.refundedAt) {
      return { refunded: false, reason: 'already_refunded' };
    }
    if (promo.refundPolicy !== PromotionRefundPolicy.PROPORTIONAL) {
      return { refunded: false, reason: 'policy_none' };
    }
    if (!promo.stripePaymentIntentId || !promo.chargedAt) {
      return { refunded: false, reason: 'not_charged' };
    }

    const amountInCents = Math.max(0, promo.budgetCents);
    if (amountInCents <= 0) {
      return { refunded: false, reason: 'no_remaining_budget' };
    }

    const refund = await this.stripeService.createRefundFromCheckoutSession({
      checkoutSessionId: promo.stripePaymentIntentId,
      amountInCents,
      idempotencyKey: `promotion-refund-${promotionId}-${reason}`,
      metadata: {
        promotionId,
        type: reason,
      },
    });

    if (refund) {
      await this.prisma.promotion.update({
        where: { id: promotionId },
        data: { refundedAt: new Date() },
      });
      try {
        await this.prisma.transaction.create({
          data: {
            type: 'PROMOTION_PAYMENT',
            amount: -(refund.amount || amountInCents),
            currency: (refund.currency || promo.currency).toUpperCase(),
            status: 'REFUNDED',
            senderId: null,
            receiverId: promo.userId,
            promotionId,
            description: `Promotion refund (${reason})`,
            // The Stripe refund id gives this row the same DB-layer
            // duplicate protection (via Transaction.stripePaymentIntentId's
            // unique constraint) as every other monetization Transaction —
            // a second concurrent call reusing the same idempotencyKey gets
            // the same refund.id back from Stripe, so the second create()
            // here hits the unique constraint (caught below) instead of
            // double-counting the refund.
            stripePaymentIntentId: refund.id,
          },
        });
      } catch (err: unknown) {
        const isDuplicateRefundRow =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === 'P2002';
        if (!isDuplicateRefundRow) {
          throw err;
        }
        // The first concurrent call already wrote this exact refund's
        // Transaction row — treat this as the same successful outcome
        // rather than surfacing a raw constraint error to the caller.
      }
      return {
        refunded: true,
        amount: (refund.amount || amountInCents) / 100,
        currency: (refund.currency || promo.currency).toUpperCase(),
      };
    }

    return { refunded: false, reason: 'skipped_unpaid' };
  }
}
