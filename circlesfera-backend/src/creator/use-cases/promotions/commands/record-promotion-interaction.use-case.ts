import { Inject, Injectable } from '@nestjs/common';
import { PromotionStatus } from '@prisma/client';
import {
  PROMOTION_COST_PER_VIEW_CENTS,
  PROMOTION_VIEWS_PER_PERSON_PER_DAY,
} from '../../../../common/constants/monetization.constants.js';
import {
  dailyBudgetReached,
  spentOn,
  utcDay,
} from '../../../../common/promotions/promotion-pacing.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class RecordPromotionInteractionUseCase {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // A view of a promotion by a signed-in person. It costs one cent the first
  // time that person sees it on a day, and nothing after; never more on a day
  // than the budget per day, nor more than what is left.
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
          dailyBudgetCents: number | null;
          spendDay: string | null;
          spentTodayCents: number;
        }>
      >`
        SELECT id, "budgetCents", "userId", status::text AS status,
               "dailyBudgetCents", "spendDay"::text AS "spendDay",
               "spentTodayCents"
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

      const day = utcDay();
      if (dailyBudgetReached(promo, day)) {
        return { success: false };
      }

      const seen = await tx.$queryRaw<Array<{ views: number }>>`
        INSERT INTO promotion_views ("promotionId", "userId", "day", "views")
        VALUES (${promotionId}, ${viewerId}, ${day}::date, 1)
        ON CONFLICT ("promotionId", "userId", "day")
        DO UPDATE SET "views" = promotion_views."views" + 1
        WHERE promotion_views."views" < ${PROMOTION_VIEWS_PER_PERSON_PER_DAY}
        RETURNING "views"
      `;
      // Seen as often as a day allows: not counted again.
      if (seen.length === 0) {
        return { success: false };
      }
      // Seen before today: counted and paid already.
      if ((seen[0]?.views ?? 1) > 1) {
        return { success: true };
      }

      const newBudgetCents = promo.budgetCents - PROMOTION_COST_PER_VIEW_CENTS;
      await tx.promotion.update({
        where: { id: promotionId },
        data: {
          reach: { increment: 1 },
          budgetCents: newBudgetCents,
          spendDay: new Date(`${day}T00:00:00.000Z`),
          spentTodayCents: spentOn(promo, day) + PROMOTION_COST_PER_VIEW_CENTS,
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
