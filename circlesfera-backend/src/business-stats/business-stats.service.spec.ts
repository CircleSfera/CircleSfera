import { ErrorCode } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRedis } from '../common/testing/fake-redis.js';
import {
  BUSINESS_STAT_RETENTION_DAYS,
  BUSINESS_STAT_TOP_COUNTRIES,
} from './business-stats.constants.js';
import {
  BusinessStatsService,
  guestNetwork,
  utcDay,
} from './business-stats.service.js';

const NOW = new Date('2026-11-18T15:30:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('BusinessStatsService', () => {
  let redis: FakeRedis;
  let prisma: {
    profile: { findUnique: ReturnType<typeof vi.fn> };
    profileMember: { findFirst: ReturnType<typeof vi.fn> };
    user: { findUnique: ReturnType<typeof vi.fn> };
    businessStatDay: {
      upsert: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    $queryRaw: ReturnType<typeof vi.fn>;
  };
  let hasher: { hash: ReturnType<typeof vi.fn> };
  let service: BusinessStatsService;

  const business = {
    accountType: 'BUSINESS',
    userId: 'owner',
    isAccountBanned: false,
  };

  beforeEach(() => {
    redis = new FakeRedis();
    prisma = {
      profile: { findUnique: vi.fn().mockResolvedValue(business) },
      profileMember: { findFirst: vi.fn().mockResolvedValue(null) },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          signupCountry: 'FR',
          settings: { country: 'es' },
        }),
      },
      businessStatDay: {
        upsert: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    hasher = { hash: vi.fn((v: string) => `h(${v})`) };
    service = new BusinessStatsService(
      prisma as never,
      redis as never,
      hasher as never,
    );
  });

  describe('counting', () => {
    it('counts a signed-in visitor once a day, as a total of the day and their country', async () => {
      await service.record('p1', 'visit', 'viewer', null, NOW);
      await service.record('p1', 'visit', 'viewer', null, NOW);
      expect(prisma.businessStatDay.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.businessStatDay.upsert).toHaveBeenCalledWith({
        where: {
          profileId_day_country: {
            profileId: 'p1',
            day: utcDay(NOW),
            country: 'ES',
          },
        },
        create: { profileId: 'p1', day: utcDay(NOW), country: 'ES', visits: 1 },
        update: { visits: { increment: 1 } },
      });
      // Nothing that says who is stored with the totals.
      expect(
        JSON.stringify(prisma.businessStatDay.upsert.mock.calls),
      ).not.toContain('viewer');
    });

    it('counts each kind of tap on its own, and again the next day', async () => {
      await service.record('p1', 'visit', 'viewer', null, NOW);
      await service.record('p1', 'call', 'viewer', null, NOW);
      await service.record(
        'p1',
        'visit',
        'viewer',
        null,
        new Date(NOW.getTime() + DAY_MS),
      );
      const columns = prisma.businessStatDay.upsert.mock.calls.map(
        ([arg]) => Object.keys(arg.update)[0],
      );
      expect(columns).toEqual(['visits', 'callTaps', 'visits']);
    });

    it('counts a guest by their address, with no country', async () => {
      await service.record('p1', 'email', null, '203.0.113.9', NOW);
      await service.record('p1', 'email', null, '203.0.113.9', NOW);
      expect(prisma.businessStatDay.upsert).toHaveBeenCalledTimes(1);
      expect(
        prisma.businessStatDay.upsert.mock.calls[0][0].create.country,
      ).toBe('');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      // The key that tells the guest apart is a hash, not the address.
      expect(JSON.stringify(redis)).not.toContain('203.0.113.9');
    });

    it('falls back to the country of the network at sign-up, and to unknown for one it cannot read', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        signupCountry: 'FR',
        settings: null,
      });
      await service.record('p1', 'visit', 'a', null, NOW);
      prisma.user.findUnique.mockResolvedValueOnce({
        signupCountry: 'not a country',
        settings: null,
      });
      await service.record('p1', 'visit', 'b', null, NOW);
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await service.record('p1', 'visit', 'c', null, NOW);
      expect(
        prisma.businessStatDay.upsert.mock.calls.map(
          ([arg]) => arg.create.country,
        ),
      ).toEqual(['FR', '', '']);
    });

    it('never counts the owner, a team member, or a Profile that is not a Business in good standing', async () => {
      await service.record('p1', 'visit', 'owner', null, NOW);
      prisma.profileMember.findFirst.mockResolvedValueOnce({ id: 'm1' });
      await service.record('p1', 'visit', 'member', null, NOW);
      prisma.profile.findUnique.mockResolvedValueOnce({
        ...business,
        accountType: 'CREATOR',
      });
      await service.record('p1', 'visit', 'viewer', null, NOW);
      prisma.profile.findUnique.mockResolvedValueOnce({
        ...business,
        isAccountBanned: true,
      });
      await service.record('p1', 'visit', 'viewer', null, NOW);
      prisma.profile.findUnique.mockResolvedValueOnce(null);
      await service.record('p1', 'visit', 'viewer', null, NOW);
      expect(prisma.profileMember.findFirst).toHaveBeenCalledWith({
        where: {
          profileId: 'p1',
          userId: 'member',
          status: { in: ['ACTIVE', 'PAUSED'] },
        },
        select: { id: true },
      });
      expect(prisma.businessStatDay.upsert).not.toHaveBeenCalled();
    });

    it('counts nothing when it cannot tell who it was', async () => {
      await service.record('p1', 'visit', null, null, NOW);
      vi.spyOn(redis, 'set').mockRejectedValueOnce(new Error('down'));
      await service.record('p1', 'visit', 'viewer', null, NOW);
      expect(prisma.businessStatDay.upsert).not.toHaveBeenCalled();
    });

    it('counts a guest on IPv6 by their /64 network, so new addresses of one machine do not add up', async () => {
      await service.record('p1', 'visit', null, '2001:db8:1:2::a', NOW);
      await service.record('p1', 'visit', null, '2001:db8:1:2:ffff::b', NOW);
      await service.record('p1', 'visit', null, '2001:db8:1:3::a', NOW);
      expect(prisma.businessStatDay.upsert).toHaveBeenCalledTimes(2);
      expect(guestNetwork('2001:0DB8:0001:0002:0:0:0:1')).toBe(
        '2001:db8:1:2::/64',
      );
      expect(guestNetwork('::1')).toBe('0:0:0:0::/64');
      expect(guestNetwork('203.0.113.9')).toBe('203.0.113.9');
    });

    it('adds to the row another first visit made at the same moment', async () => {
      (prisma.businessStatDay as Record<string, unknown>).update = vi
        .fn()
        .mockResolvedValue({});
      prisma.businessStatDay.upsert.mockRejectedValueOnce(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      );
      await service.record('p1', 'call', 'viewer', null, NOW);
      expect(
        (
          prisma.businessStatDay as unknown as {
            update: ReturnType<typeof vi.fn>;
          }
        ).update,
      ).toHaveBeenCalledWith({
        where: {
          profileId_day_country: {
            profileId: 'p1',
            day: utcDay(NOW),
            country: 'ES',
          },
        },
        data: { callTaps: { increment: 1 } },
      });
      prisma.businessStatDay.upsert.mockRejectedValueOnce(new Error('db down'));
      await expect(
        service.record('p1', 'email', 'viewer', null, NOW),
      ).rejects.toThrow('db down');
    });

    it('still tells a person once a day without the hashing secret', async () => {
      hasher.hash.mockReturnValue(null);
      await service.record('p1', 'visit', 'viewer', null, NOW);
      await service.record('p1', 'visit', 'viewer', null, NOW);
      expect(prisma.businessStatDay.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('reading', () => {
    it('is only for a Business Profile', async () => {
      prisma.profile.findUnique.mockResolvedValueOnce({
        accountType: 'CREATOR',
      });
      await expect(service.read('p1', 28, NOW)).rejects.toMatchObject({
        errorCode: ErrorCode.BUSINESS_ACCOUNT_REQUIRED,
      });
    });

    it('adds up the days and countries, fills the quiet days, and keeps the best hours', async () => {
      const today = utcDay(NOW);
      const yesterday = new Date(today.getTime() - DAY_MS);
      prisma.businessStatDay.findMany.mockResolvedValueOnce([
        {
          day: today,
          country: 'ES',
          visits: 5,
          emailTaps: 1,
          callTaps: 2,
          addressTaps: 0,
          websiteTaps: 1,
        },
        {
          day: today,
          country: '',
          visits: 2,
          emailTaps: 0,
          callTaps: 0,
          addressTaps: 1,
          websiteTaps: 0,
        },
        {
          day: yesterday,
          country: 'FR',
          visits: 3,
          emailTaps: 0,
          callTaps: 1,
          addressTaps: 0,
          websiteTaps: 0,
        },
        {
          day: yesterday,
          country: 'IT',
          visits: 0,
          emailTaps: 1,
          callTaps: 0,
          addressTaps: 0,
          websiteTaps: 0,
        },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([
        { hour: 9, views: 4n },
        { hour: 20, views: 11n },
        { hour: 99, views: 1n },
      ]);
      const stats = await service.read('p1', 7, NOW);
      expect(stats.days).toBe(7);
      expect(stats.totals).toEqual({
        visits: 10,
        emailTaps: 2,
        callTaps: 3,
        addressTaps: 1,
        websiteTaps: 1,
      });
      expect(stats.daily).toHaveLength(7);
      expect(stats.daily[0].day).toBe('2026-11-12');
      expect(stats.daily[5]).toEqual({
        day: '2026-11-17',
        visits: 3,
        emailTaps: 1,
        callTaps: 1,
        addressTaps: 0,
        websiteTaps: 0,
      });
      expect(stats.daily[6].visits).toBe(7);
      expect(stats.daily[1].visits).toBe(0);
      // Countries by visits; one with no visits is left out, and one with
      // too few to keep its visitors apart goes with the others.
      expect(stats.countries).toEqual([
        { country: 'ES', visits: 5 },
        { country: 'FR', visits: 3 },
      ]);
      expect(stats.otherCountriesVisits).toBe(2);
      expect(stats.viewsByHour[9]).toBe(4);
      expect(stats.viewsByHour[20]).toBe(11);
      expect(stats.viewsByHour).toHaveLength(24);
      expect(prisma.businessStatDay.findMany.mock.calls[0][0].where).toEqual({
        profileId: 'p1',
        day: { gte: new Date('2026-11-12T00:00:00Z') },
      });
    });

    it('lists the first countries and adds up the rest, over 28 days unless asked for 7 or 90', async () => {
      const today = utcDay(NOW);
      const many = Array.from(
        { length: BUSINESS_STAT_TOP_COUNTRIES + 2 },
        (_, i) => ({
          day: today,
          country: `A${String.fromCharCode(65 + i)}`,
          visits: 100 - i,
          emailTaps: 0,
          callTaps: 0,
          addressTaps: 0,
          websiteTaps: 0,
        }),
      );
      prisma.businessStatDay.findMany.mockResolvedValueOnce(many);
      const stats = await service.read('p1', 5, NOW);
      expect(stats.days).toBe(28);
      expect(stats.countries).toHaveLength(BUSINESS_STAT_TOP_COUNTRIES);
      expect(stats.otherCountriesVisits).toBe(
        100 -
          BUSINESS_STAT_TOP_COUNTRIES +
          (100 - BUSINESS_STAT_TOP_COUNTRIES - 1),
      );
      expect((await service.read('p1', 90, NOW)).days).toBe(90);
      expect((await service.read('p1', undefined, NOW)).days).toBe(28);
    });
  });

  describe('keeping', () => {
    it('removes the totals older than 13 months', async () => {
      await expect(service.prune(NOW)).resolves.toBe(3);
      expect(prisma.businessStatDay.deleteMany).toHaveBeenCalledWith({
        where: {
          day: {
            lt: new Date(
              utcDay(NOW).getTime() - BUSINESS_STAT_RETENTION_DAYS * DAY_MS,
            ),
          },
        },
      });
    });

    it('does it every day, saying when it could not', async () => {
      await service.pruneDaily();
      prisma.businessStatDay.deleteMany.mockResolvedValueOnce({ count: 0 });
      await service.pruneDaily();
      prisma.businessStatDay.deleteMany.mockRejectedValueOnce(new Error('db'));
      await expect(service.pruneDaily()).resolves.toBeUndefined();
    });
  });
});
