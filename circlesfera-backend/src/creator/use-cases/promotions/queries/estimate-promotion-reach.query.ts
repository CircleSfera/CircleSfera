import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { ENTITLED_STATUSES } from '../../../../common/constants/plan-features.constants.js';
import { eurosToCents } from '../../../../common/constants/promotion.constants.js';
import {
  estimatedReach,
  PROMOTION_AUDIENCE_ACTIVE_DAYS,
} from '../../../../common/promotions/promotion-reach.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

// The people there are to reach, by country, worked out at most once an
// hour for every buyer: an estimate never scans the people on each choice.
const AUDIENCE_CACHE_KEY = 'promotions:audience-by-country';
const AUDIENCE_CACHE_MS = 60 * 60 * 1000;

// People whose country is not known: reached only by a promotion aimed
// everywhere.
const NO_COUNTRY = '';

/**
 * The reach a promotion would have, shown before it is bought (PD-089): a
 * range of people, from the budget, the length and how many people the feed
 * would show it to in the countries chosen. It never gives the number of
 * people itself; a small group gives no number at all.
 */
@Injectable()
export class EstimatePromotionReachQuery {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async execute(
    dailyBudget: number,
    durationDays: number,
    countries: string[] = [],
  ): Promise<{ low: number; high: number } | { low: null; high: null }> {
    const byCountry = await this.audienceByCountry();
    const audience =
      countries.length === 0
        ? Object.values(byCountry).reduce((sum, people) => sum + people, 0)
        : countries.reduce((sum, code) => sum + (byCountry[code] ?? 0), 0);
    return (
      estimatedReach({
        dailyBudgetCents: eurosToCents(dailyBudget),
        durationDays,
        audience,
      }) ?? { low: null, high: null }
    );
  }

  /**
   * The people a promoted post can be shown to, by country: active in the
   * last days, not a Test Account (a real promotion is never shown to one),
   * and with no plan that leaves promoted posts out of their feed. A
   * person's country is the one in their settings, or else the one of their
   * network at sign-up (viewerCountryOf), as the feed reads it.
   */
  private async audienceByCountry(): Promise<Record<string, number>> {
    const cached =
      await this.cacheManager.get<Record<string, number>>(AUDIENCE_CACHE_KEY);
    if (cached) return cached;

    const since = new Date(
      Date.now() - PROMOTION_AUDIENCE_ACTIVE_DAYS * 24 * 60 * 60 * 1000,
    );
    const rows = await this.prisma.$queryRaw<
      Array<{ country: string | null; people: number | bigint }>
    >`
      SELECT COALESCE(s."country", u."signupCountry") AS "country",
             COUNT(*) AS "people"
      FROM "users" u
      LEFT JOIN "user_settings" s ON s."userId" = u."id"
      WHERE u."isActive" = true
        AND u."isTestAccount" = false
        AND (u."lastSeenAt" >= ${since} OR u."createdAt" >= ${since})
        AND NOT EXISTS (
          SELECT 1
          FROM "platform_subscriptions" ps
          JOIN "profiles" p ON p."id" = ps."profileId"
          JOIN "platform_plans" pl ON pl."id" = ps."planId"
          WHERE p."userId" = u."id"
            AND ps."status"::text IN (${Prisma.join([...ENTITLED_STATUSES])})
            AND 'no_promoted_content' = ANY (pl."features")
        )
      GROUP BY 1
    `;
    const byCountry: Record<string, number> = {};
    for (const row of rows) {
      const key = row.country ?? NO_COUNTRY;
      byCountry[key] = (byCountry[key] ?? 0) + Number(row.people);
    }
    await this.cacheManager.set(
      AUDIENCE_CACHE_KEY,
      byCountry,
      AUDIENCE_CACHE_MS,
    );
    return byCountry;
  }
}
