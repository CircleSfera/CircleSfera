import { Inject, Injectable } from '@nestjs/common';
import { PromotionStatus } from '@prisma/client';
import { PROMOTION_COST_PER_VIEW_CENTS } from '../../../../common/constants/monetization.constants.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class RecordPromotionInteractionUseCase {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordView(promotionId: string, viewerId: string) {
    if (!viewerId) {
      return { success: false };
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          budgetCents: number;
          userId: string;
          status: string;
        }>
      >`
        SELECT id, "budgetCents", "userId", status::text AS status
        FROM promotions
        WHERE id = ${promotionId}
        FOR UPDATE
      `;

      const promo = rows[0];
      if (promo?.status !== 'ACTIVE') {
        return { success: false };
      }
      if (promo.userId === viewerId) {
        return { success: false };
      }
      if (promo.budgetCents < PROMOTION_COST_PER_VIEW_CENTS) {
        await tx.promotion.update({
          where: { id: promotionId },
          data: { budgetCents: 0, status: PromotionStatus.COMPLETED },
        });
        return { success: false };
      }

      const newBudgetCents = promo.budgetCents - PROMOTION_COST_PER_VIEW_CENTS;
      await tx.promotion.update({
        where: { id: promotionId },
        data: {
          reach: { increment: 1 },
          budgetCents: newBudgetCents,
          ...(newBudgetCents <= 0
            ? { status: PromotionStatus.COMPLETED, budgetCents: 0 }
            : {}),
        },
      });

      return { success: true };
    });
  }

  async recordClick(promotionId: string, viewerId?: string) {
    const promo = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (promo?.status !== 'ACTIVE') {
      return { success: false };
    }

    if (promo.userId === viewerId) {
      return { success: false };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.promotion.update({
        where: { id: promotionId },
        data: { clicks: { increment: 1 } },
      });

      await tx.interactionEvent.create({
        data: {
          userId: viewerId || null,
          eventType: 'SPONSORED_PLACEMENT_CLICK',
          targetId: promo.targetId,
          targetType: 'PROMOTION',
        },
      });
    });

    return { success: true };
  }
}
