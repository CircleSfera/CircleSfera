import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PromotionRefundPolicy } from '@prisma/client';
import { StripeService } from '../../../../common/stripe/stripe.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class RefundPromotionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeService) private readonly stripeService: StripeService,
  ) {}

  async execute(promotionId: string, reason: string) {
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
        },
      });
      return {
        refunded: true,
        amount: (refund.amount || amountInCents) / 100,
      };
    }

    return { refunded: false, reason: 'skipped_unpaid' };
  }
}
