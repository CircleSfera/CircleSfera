import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { eurosToCents } from '../../../../common/constants/promotion.constants.js';
import {
  estimatedReach,
  PROMOTION_AUDIENCE_ACTIVE_DAYS,
} from '../../../../common/promotions/promotion-reach.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

/**
 * The reach a promotion would have, shown before it is bought (PD-089): a
 * range of people, from the budget, the length and how many people are
 * active in the countries it is aimed at. The buyer is never counted.
 */
@Injectable()
export class EstimatePromotionReachQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(
    userId: string,
    dailyBudget: number,
    durationDays: number,
    countries: string[] = [],
  ) {
    const since = new Date(
      Date.now() - PROMOTION_AUDIENCE_ACTIVE_DAYS * 24 * 60 * 60 * 1000,
    );
    // A person's country is the one in their settings, or else the one of
    // their network at sign-up (viewerCountryOf), as the feed reads it.
    const inCountries: Prisma.UserWhereInput =
      countries.length === 0
        ? {}
        : {
            OR: [
              { settings: { country: { in: countries } } },
              {
                signupCountry: { in: countries },
                OR: [{ settings: null }, { settings: { country: null } }],
              },
            ],
          };
    const audience = await this.prisma.user.count({
      where: {
        id: { not: userId },
        isActive: true,
        lastSeenAt: { gte: since },
        ...inCountries,
      },
    });
    return {
      ...estimatedReach({
        dailyBudgetCents: eurosToCents(dailyBudget),
        durationDays,
        audience,
      }),
      audience,
    };
  }
}
