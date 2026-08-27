import { Inject, Injectable } from '@nestjs/common';
import { PromotionStatus, PromotionTargetType } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetPromotionsQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(userId: string, page = 1, limit = 10) {
    await this.prisma.promotion.updateMany({
      where: {
        userId,
        status: { in: [PromotionStatus.ACTIVE, PromotionStatus.PAUSED] },
        endDate: { lt: new Date() },
      },
      data: { status: PromotionStatus.COMPLETED },
    });

    const where = {
      userId,
      status: {
        in: [
          PromotionStatus.ACTIVE,
          PromotionStatus.PAUSED,
          PromotionStatus.COMPLETED,
          PromotionStatus.PENDING,
          PromotionStatus.CANCELLED,
        ],
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.promotion.count({ where }),
    ]);

    const enriched = await Promise.all(
      data.map(async (promo) => {
        let target: {
          caption?: string | null;
          thumbnail?: string | null;
          type?: string;
        } | null = null;

        if (promo.targetType === PromotionTargetType.POST) {
          const post = await this.prisma.post.findUnique({
            where: { id: promo.targetId },
            select: {
              caption: true,
              type: true,
              media: { take: 1, select: { url: true, type: true } },
            },
          });
          if (post) {
            target = {
              caption: post.caption,
              thumbnail: post.media?.[0]?.url || null,
              type: post.type,
            };
          }
        } else if (promo.targetType === PromotionTargetType.STORY) {
          const story = await this.prisma.story.findUnique({
            where: { id: promo.targetId },
            select: { url: true, mediaType: true },
          });
          if (story) {
            target = {
              caption: null,
              thumbnail: story.url,
              type: 'STORY',
            };
          }
        } else if (promo.targetType === PromotionTargetType.PROFILE) {
          const profile = await this.prisma.profile.findUnique({
            where: { id: promo.targetId },
            select: { username: true, avatar: true },
          });
          if (profile) {
            target = {
              caption: profile.username,
              thumbnail: profile.avatar,
              type: 'PROFILE',
            };
          }
        }

        // Wire money as integer cents (budgetCents / dailyBudgetCents).
        return {
          ...promo,
          target,
        };
      }),
    );

    return {
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
