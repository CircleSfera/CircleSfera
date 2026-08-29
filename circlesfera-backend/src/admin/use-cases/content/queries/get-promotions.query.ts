import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PromotionStatus } from '@prisma/client';
import { withPrimaryProfile } from '../../../../common/utils/user-profile-shape.util.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetPromotionsQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(
    page = 1,
    limit = 10,
    status?: PromotionStatus,
    search?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.PromotionWhereInput = {};
    if (status) where.status = status as PromotionStatus;
    if (search) {
      where.user = {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          {
            profiles: {
              some: { username: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
      };
    }

    const [promotions, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            include: { profiles: true },
          },
        },
      }),
      this.prisma.promotion.count({ where }),
    ]);

    const enrichedPromotions = await Promise.all(
      promotions.map(async (promo) => {
        let target: any = null;
        if (promo.targetType === 'POST') {
          target = await this.prisma.post.findUnique({
            where: { id: promo.targetId },
            include: { media: true },
          });
        } else if (promo.targetType === 'STORY') {
          target = await this.prisma.story.findUnique({
            where: { id: promo.targetId },
          });
        }
        return {
          ...promo,
          user: withPrimaryProfile(promo.user),
          target,
        };
      }),
    );

    return {
      data: enrichedPromotions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
