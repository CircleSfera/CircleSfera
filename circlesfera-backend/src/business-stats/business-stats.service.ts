import { createHash } from 'node:crypto';
import { ErrorCode } from '@circlesfera/shared';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { AbuseHashService } from '../abuse/abuse-hash.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { viewerCountryOf } from '../common/promotions/promotion-country.js';
import { REDIS_CLIENT } from '../common/redis/redis.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BUSINESS_STAT_COLUMN,
  BUSINESS_STAT_DEFAULT_RANGE_DAYS,
  BUSINESS_STAT_HOURS_DAYS,
  BUSINESS_STAT_MIN_COUNTRY_VISITS,
  BUSINESS_STAT_ONCE_SECONDS,
  BUSINESS_STAT_RANGES_DAYS,
  BUSINESS_STAT_RETENTION_DAYS,
  BUSINESS_STAT_TOP_COUNTRIES,
  type BusinessStatKind,
} from './business-stats.constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const COUNTRY = /^[A-Z]{2}$/;

// The UTC day of a moment, at midnight.
export function utcDay(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
}

const dayKey = (day: Date) => day.toISOString().slice(0, 10);

/**
 * Who a guest is, for counting once a day: the address, or for IPv6 its
 * /64 network, which one household or machine holds as a whole.
 */
export function guestNetwork(address: string): string {
  if (!address.includes(':')) return address;
  const [head, tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = address.includes('::')
    ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((g) => (g || '0').toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

type Totals = {
  visits: number;
  emailTaps: number;
  callTaps: number;
  addressTaps: number;
  websiteTaps: number;
};

const empty = (): Totals => ({
  visits: 0,
  emailTaps: 0,
  callTaps: 0,
  addressTaps: 0,
  websiteTaps: 0,
});

export interface BusinessStats {
  days: number;
  totals: Totals;
  daily: ({ day: string } & Totals)[];
  countries: { country: string; visits: number }[];
  otherCountriesVisits: number;
  // Views of the Profile's posts by UTC hour, over the last 28 days.
  viewsByHour: number[];
}

@Injectable()
export class BusinessStatsService {
  private readonly logger = new Logger(BusinessStatsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AbuseHashService) private readonly hasher: AbuseHashService,
  ) {}

  /**
   * Counts a visit to a Business Profile, or a tap on one of its buttons:
   * once a day per person, never the Profile's owner or team, and only as a
   * total of the day and the visitor's country. Nothing says who it was.
   */
  async record(
    profileId: string,
    kind: BusinessStatKind,
    viewerUserId: string | null,
    guestAddress: string | null,
    now = new Date(),
  ): Promise<void> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { accountType: true, userId: true, isAccountBanned: true },
    });
    if (profile?.accountType !== 'BUSINESS' || profile.isAccountBanned) {
      return;
    }
    if (viewerUserId) {
      if (viewerUserId === profile.userId) return;
      const member = await this.prisma.profileMember.findFirst({
        where: {
          profileId,
          userId: viewerUserId,
          status: { in: ['ACTIVE', 'PAUSED'] },
        },
        select: { id: true },
      });
      if (member) return;
    }
    const who = viewerUserId
      ? `u:${viewerUserId}`
      : guestAddress
        ? `g:${guestNetwork(guestAddress)}`
        : null;
    if (!who) return;

    const day = utcDay(now);
    if (!(await this.firstToday(dayKey(day), profileId, kind, who))) return;

    let country = '';
    if (viewerUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: viewerUserId },
        select: {
          signupCountry: true,
          settings: { select: { country: true } },
        },
      });
      const found = viewerCountryOf(user)?.toUpperCase() ?? '';
      country = COUNTRY.test(found) ? found : '';
    }

    const column = BUSINESS_STAT_COLUMN[kind];
    const where = { profileId_day_country: { profileId, day, country } };
    const update = { [column]: { increment: 1 } };
    try {
      await this.prisma.businessStatDay.upsert({
        where,
        create: { profileId, day, country, [column]: 1 },
        update,
      });
    } catch (e) {
      // Two first visits of the day at once: the other one made the row.
      if ((e as { code?: string }).code !== 'P2002') throw e;
      await this.prisma.businessStatDay.update({ where, data: update });
    }
  }

  // Whether this is the first time today this person does this on this
  // Profile. The key is a one-way hash, gone after a day. When it cannot be
  // told, nothing is counted.
  private async firstToday(
    day: string,
    profileId: string,
    kind: BusinessStatKind,
    who: string,
  ): Promise<boolean> {
    const preimage = `${day}:${profileId}:${who}`;
    const hashed =
      this.hasher.hash(preimage) ??
      createHash('sha256').update(preimage).digest('hex');
    try {
      const ok = await this.redis.set(
        `business-stat:${day}:${profileId}:${kind}:${hashed}`,
        '1',
        'EX',
        BUSINESS_STAT_ONCE_SECONDS,
        'NX',
      );
      return ok === 'OK';
    } catch (e) {
      this.logger.warn(`Could not count a business visit: ${String(e)}`);
      return false;
    }
  }

  /** The statistics of a Business Profile over the last days. */
  async read(
    profileId: string,
    requestedDays: number | undefined,
    now = new Date(),
  ): Promise<BusinessStats> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { accountType: true },
    });
    if (profile?.accountType !== 'BUSINESS') {
      throw new AppException(
        ErrorCode.BUSINESS_ACCOUNT_REQUIRED,
        HttpStatus.FORBIDDEN,
        'Business statistics are for Business Profiles.',
      );
    }
    const days = (BUSINESS_STAT_RANGES_DAYS as readonly number[]).includes(
      requestedDays ?? -1,
    )
      ? (requestedDays as number)
      : BUSINESS_STAT_DEFAULT_RANGE_DAYS;
    const today = utcDay(now);
    const from = new Date(today.getTime() - (days - 1) * DAY_MS);

    const rows = await this.prisma.businessStatDay.findMany({
      where: { profileId, day: { gte: from } },
      select: {
        day: true,
        country: true,
        visits: true,
        emailTaps: true,
        callTaps: true,
        addressTaps: true,
        websiteTaps: true,
      },
    });

    const totals = empty();
    const byDay = new Map<string, Totals>();
    const byCountry = new Map<string, number>();
    for (const row of rows) {
      const key = dayKey(row.day);
      const day = byDay.get(key) ?? empty();
      for (const field of Object.keys(totals) as (keyof Totals)[]) {
        totals[field] += row[field];
        day[field] += row[field];
      }
      byDay.set(key, day);
      byCountry.set(
        row.country,
        (byCountry.get(row.country) ?? 0) + row.visits,
      );
    }
    const daily = Array.from({ length: days }, (_, i) => {
      const key = dayKey(new Date(from.getTime() + i * DAY_MS));
      return { day: key, ...(byDay.get(key) ?? empty()) };
    });
    const counted = [...byCountry.entries()].filter(([, visits]) => visits > 0);
    const few = counted
      .filter(([, visits]) => visits < BUSINESS_STAT_MIN_COUNTRY_VISITS)
      .reduce((sum, [, visits]) => sum + visits, 0);
    const ranked = counted
      .filter(([, visits]) => visits >= BUSINESS_STAT_MIN_COUNTRY_VISITS)
      .map(([country, visits]) => ({ country, visits }))
      .sort(
        (a, b) => b.visits - a.visits || a.country.localeCompare(b.country),
      );
    const countries = ranked.slice(0, BUSINESS_STAT_TOP_COUNTRIES);
    const otherCountriesVisits =
      few +
      ranked
        .slice(BUSINESS_STAT_TOP_COUNTRIES)
        .reduce((sum, c) => sum + c.visits, 0);

    const since = new Date(now.getTime() - BUSINESS_STAT_HOURS_DAYS * DAY_MS);
    const hours = await this.prisma.$queryRaw<
      { hour: number; views: bigint }[]
    >`
      SELECT EXTRACT(HOUR FROM pv."createdAt")::int AS hour,
             COUNT(*)::bigint AS views
      FROM "post_views" pv
      JOIN "posts" p ON p."id" = pv."postId"
      WHERE p."profileId" = ${profileId} AND pv."createdAt" >= ${since}
      GROUP BY hour`;
    const viewsByHour = Array.from({ length: 24 }, () => 0);
    for (const { hour, views } of hours) {
      if (hour >= 0 && hour < 24) viewsByHour[hour] = Number(views);
    }

    return {
      days,
      totals,
      daily,
      countries,
      otherCountriesVisits,
      viewsByHour,
    };
  }

  // Every day, the totals older than 13 months go.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneDaily(): Promise<void> {
    try {
      const removed = await this.prune();
      if (removed) this.logger.log(`Removed ${removed} old business totals`);
    } catch (e) {
      this.logger.error(`Could not remove old business totals: ${String(e)}`);
    }
  }

  /** Removes the totals older than 13 months. */
  async prune(now = new Date()): Promise<number> {
    const before = new Date(
      utcDay(now).getTime() - BUSINESS_STAT_RETENTION_DAYS * DAY_MS,
    );
    const result = await this.prisma.businessStatDay.deleteMany({
      where: { day: { lt: before } },
    });
    return result.count;
  }
}
