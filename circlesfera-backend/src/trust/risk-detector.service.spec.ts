import { NotificationType } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RiskDetectorService } from './risk-detector.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-05T10:00:00.000Z');

describe('RiskDetectorService', () => {
  let tx: {
    $queryRaw: ReturnType<typeof vi.fn>;
    riskCase: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let prisma: {
    profile: { findUnique: ReturnType<typeof vi.fn> };
    user: { count: ReturnType<typeof vi.fn> };
    riskCase: { deleteMany: ReturnType<typeof vi.fn> };
    $queryRaw: ReturnType<typeof vi.fn>;
    $transaction: ReturnType<typeof vi.fn>;
  };
  let limits: {
    readSignals: ReturnType<typeof vi.fn>;
    setRestricted: ReturnType<typeof vi.fn>;
    tryEvaluationLock: ReturnType<typeof vi.fn>;
    onEvaluationNeeded: ReturnType<typeof vi.fn>;
    recentlyActiveProfiles: ReturnType<typeof vi.fn>;
  };
  let notifications: { create: ReturnType<typeof vi.fn> };
  let service: RiskDetectorService;

  const profile = (overrides: Record<string, unknown> = {}, user = {}) => ({
    id: 'p-1',
    isAccountBanned: false,
    user: {
      id: 'u-1',
      createdAt: new Date(NOW.getTime() - 60 * DAY_MS),
      isActive: true,
      isRootBanned: false,
      isTestAccount: false,
      identityVerifiedAt: null,
      signupIpHash: 'ip-1',
      lastIpHash: null,
      deviceSignals: [],
      ...user,
    },
    _count: { followers: 100, following: 100 },
    ...overrides,
  });

  const live = (overrides: Record<string, unknown> = {}) =>
    limits.readSignals.mockResolvedValue({
      velocity: {},
      repeatedText: 0,
      coordinatedText: 0,
      writesToday: 0,
      ...overrides,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      riskCase: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }) => ({
          id: 'case-1',
          restrictedUntil: null,
          ...data,
        })),
        update: vi.fn(async ({ data }) => ({
          id: 'case-1',
          restrictedUntil: null,
          ...data,
        })),
        findUnique: vi.fn(),
      },
    };
    prisma = {
      profile: { findUnique: vi.fn().mockResolvedValue(profile()) },
      user: { count: vi.fn().mockResolvedValue(0) },
      riskCase: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      $queryRaw: vi.fn().mockResolvedValue([{ n: 0n }]),
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    limits = {
      readSignals: vi.fn(),
      setRestricted: vi.fn().mockResolvedValue(undefined),
      tryEvaluationLock: vi.fn().mockResolvedValue(true),
      onEvaluationNeeded: vi.fn(),
      recentlyActiveProfiles: vi.fn().mockResolvedValue([]),
    };
    live();
    notifications = { create: vi.fn().mockResolvedValue(undefined) };
    service = new RiskDetectorService(
      prisma as never,
      limits as never,
      notifications as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('evaluate', () => {
    it('never evaluates Test Accounts, banned Profiles or inactive accounts', async () => {
      for (const p of [
        profile({}, { isTestAccount: true }),
        profile({ isAccountBanned: true }),
        profile({}, { isActive: false }),
        profile({}, { isRootBanned: true }),
      ]) {
        prisma.profile.findUnique.mockResolvedValueOnce(p);
        expect(await service.evaluate('p-1')).toBeNull();
      }
    });

    it('scores 0 with no signal', async () => {
      const result = await service.evaluate('p-1');
      expect(result).toEqual({ profileId: 'p-1', score: 0, signals: [] });
    });

    it('adds the velocity signal once, for the action furthest over its threshold', async () => {
      live({ velocity: { follow: 45, comment: 60, message_request: 0 } });

      const result = await service.evaluate('p-1');

      expect(result?.signals).toEqual([
        { key: 'velocity', points: 25, value: 60 },
      ]);
    });

    it('adds repeated and coordinated text', async () => {
      live({ repeatedText: 6, coordinatedText: 4 });

      const result = await service.evaluate('p-1');

      expect(result?.score).toBe(45);
    });

    it('flags a new account with more than 100 writes today, not an older one', async () => {
      live({ writesToday: 150 });
      prisma.profile.findUnique.mockResolvedValueOnce(
        profile({}, { createdAt: new Date(NOW.getTime() - 2 * DAY_MS) }),
      );
      expect((await service.evaluate('p-1'))?.signals[0]).toEqual({
        key: 'newAndHyperactive',
        points: 15,
        value: 150,
      });

      expect((await service.evaluate('p-1'))?.signals).toEqual([]);
    });

    it('scores shared IP or device clusters by size', async () => {
      prisma.user.count.mockResolvedValueOnce(2);
      expect((await service.evaluate('p-1'))?.signals[0]).toMatchObject({
        key: 'clusterSmall',
        points: 10,
        value: 3,
      });
      prisma.user.count.mockResolvedValueOnce(6);
      expect((await service.evaluate('p-1'))?.signals[0]).toMatchObject({
        key: 'clusterLarge',
        points: 20,
        value: 7,
      });
    });

    it('does not count clusters for an account without IP or device signals', async () => {
      prisma.profile.findUnique.mockResolvedValueOnce(
        profile({}, { signupIpHash: null, lastIpHash: null }),
      );
      await service.evaluate('p-1');
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it('flags following many accounts with almost no followers back', async () => {
      prisma.profile.findUnique.mockResolvedValueOnce(
        profile({ _count: { followers: 10, following: 800 } }),
      );
      expect((await service.evaluate('p-1'))?.signals[0]).toEqual({
        key: 'followRatio',
        points: 15,
        value: 0.013,
      });
    });

    it('flags reports from 3 or more different people in a week', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ n: 3n }]);
      expect((await service.evaluate('p-1'))?.signals[0]).toEqual({
        key: 'reports',
        points: 15,
        value: 3,
      });
    });

    it('a verified identity lowers the score when there are signals', async () => {
      live({ velocity: { follow: 80 } });
      prisma.profile.findUnique.mockResolvedValueOnce(
        profile({}, { identityVerifiedAt: NOW }),
      );
      expect((await service.evaluate('p-1'))?.score).toBe(5);
    });
  });

  describe('evaluateAndRecord', () => {
    it('opens no case below 50', async () => {
      live({ velocity: { follow: 80 } });
      await service.evaluateAndRecord('p-1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('opens a case at 50 or more, under a Profile row lock, without restricting', async () => {
      live({ velocity: { follow: 80 }, coordinatedText: 3 });

      await service.evaluateAndRecord('p-1');

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.riskCase.create).toHaveBeenCalledWith({
        data: {
          profileId: 'p-1',
          score: 50,
          signals: expect.any(Array),
        },
      });
      expect(limits.setRestricted).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('at 70 or more restricts the Profile for 72 hours and tells the participant', async () => {
      live({ velocity: { follow: 80 }, coordinatedText: 3, repeatedText: 5 });

      await service.evaluateAndRecord('p-1');

      const until = new Date(NOW.getTime() + 72 * 60 * 60 * 1000);
      expect(tx.riskCase.update).toHaveBeenCalledWith({
        where: { id: 'case-1' },
        data: { restrictedUntil: until },
      });
      expect(limits.setRestricted).toHaveBeenCalledWith('p-1', until);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'p-1',
          type: NotificationType.MODERATION,
          targetType: 'profile_restriction',
          targetId: 'case-1',
        }),
      );
    });

    it('restricts once per case and keeps the higher score', async () => {
      live({ velocity: { follow: 80 }, coordinatedText: 3, repeatedText: 5 });
      tx.riskCase.findFirst.mockResolvedValue({
        id: 'case-1',
        score: 90,
        restrictedUntil: new Date(NOW.getTime() + DAY_MS),
      });

      await service.evaluateAndRecord('p-1');

      expect(tx.riskCase.create).not.toHaveBeenCalled();
      expect(tx.riskCase.update).not.toHaveBeenCalled();
      expect(limits.setRestricted).not.toHaveBeenCalled();
    });

    it('evaluateSoon does nothing when the Profile was evaluated in the last minute', async () => {
      limits.tryEvaluationLock.mockResolvedValue(false);
      await service.evaluateSoon('p-1');
      expect(prisma.profile.findUnique).not.toHaveBeenCalled();
    });
  });

  it('lifts a restriction after an approved appeal', async () => {
    tx.riskCase.findUnique.mockResolvedValue({ profileId: 'p-1' });

    const profileId = await service.liftRestrictionForAppeal(
      tx as never,
      'case-1',
    );

    expect(profileId).toBe('p-1');
    expect(tx.riskCase.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { restrictedUntil: null },
    });
  });

  it('deletes closed cases 12 months after they close, never open ones', async () => {
    const purged = await service.purgeClosedCases(NOW);

    expect(purged).toBe(2);
    expect(prisma.riskCase.deleteMany).toHaveBeenCalledWith({
      where: {
        status: { not: 'OPEN' },
        updatedAt: { lt: new Date(NOW.getTime() - 365 * DAY_MS) },
      },
    });
  });

  it('the nightly run evaluates recently active Profiles and purges', async () => {
    limits.recentlyActiveProfiles.mockResolvedValue(['p-1', 'p-2']);
    await service.nightly();
    expect(prisma.profile.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.riskCase.deleteMany).toHaveBeenCalled();
  });
});
