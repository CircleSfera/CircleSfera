import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminRiskCasesService } from './admin-risk-cases.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-05T10:00:00.000Z');

describe('AdminRiskCasesService', () => {
  let prisma: {
    riskCase: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  let limits: {
    clearRestricted: ReturnType<typeof vi.fn>;
    setRestricted: ReturnType<typeof vi.fn>;
  };
  let detector: { notifyRestriction: ReturnType<typeof vi.fn> };
  let strikes: {
    suspendProfile: ReturnType<typeof vi.fn>;
    banProfile: ReturnType<typeof vi.fn>;
  };
  let adminUsers: { applyBotLabel: ReturnType<typeof vi.fn> };
  let audit: { execute: ReturnType<typeof vi.fn> };
  let service: AdminRiskCasesService;

  const openCase = {
    id: 'case-1',
    status: 'OPEN',
    profile: { id: 'p-1', userId: 'u-1' },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prisma = {
      riskCase: {
        findUnique: vi.fn().mockResolvedValue(openCase),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    limits = {
      clearRestricted: vi.fn().mockResolvedValue(undefined),
      setRestricted: vi.fn().mockResolvedValue(undefined),
    };
    detector = { notifyRestriction: vi.fn().mockResolvedValue(undefined) };
    strikes = {
      suspendProfile: vi.fn().mockResolvedValue(undefined),
      banProfile: vi.fn().mockResolvedValue(undefined),
    };
    adminUsers = { applyBotLabel: vi.fn().mockResolvedValue(undefined) };
    audit = { execute: vi.fn().mockResolvedValue(undefined) };
    service = new AdminRiskCasesService(
      prisma as never,
      limits as never,
      detector as never,
      strikes as never,
      adminUsers as never,
      audit as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The claim written for a decision.
  const claimed = () => prisma.riskCase.updateMany.mock.calls[0]?.[0];

  it('dismissing claims the case, lifts the restriction and notifies nobody', async () => {
    await service.resolve('admin-1', 'case-1', 'DISMISSED');

    expect(claimed()).toEqual({
      where: { id: 'case-1', status: 'OPEN' },
      data: {
        status: 'DISMISSED',
        decision: 'DISMISSED',
        reviewedById: 'admin-1',
        reviewedAt: NOW,
        restrictedUntil: null,
      },
    });
    expect(limits.clearRestricted).toHaveBeenCalledWith('p-1');
    expect(detector.notifyRestriction).not.toHaveBeenCalled();
    expect(audit.execute).toHaveBeenCalledWith(
      'admin-1',
      AdminAction.RISK_CASE_RESOLVED,
      'risk_case',
      'case-1',
      'Decision: DISMISSED',
    );
  });

  it('restricting keeps the reduced caps for 7 days and tells the participant', async () => {
    const until = new Date(NOW.getTime() + 7 * DAY_MS);

    await service.resolve('admin-1', 'case-1', 'RESTRICTED');

    expect(claimed().data).toMatchObject({
      status: 'ACTIONED',
      restrictedUntil: until,
      restrictedAt: NOW,
    });
    expect(limits.setRestricted).toHaveBeenCalledWith('p-1', until);
    expect(detector.notifyRestriction).toHaveBeenCalledWith(
      'p-1',
      'case-1',
      'staff',
    );
  });

  it('a bot label goes to the account, with the staff note as reason', async () => {
    await service.resolve('admin-1', 'case-1', 'BOT_LABEL', 'Posting schedule');

    expect(adminUsers.applyBotLabel).toHaveBeenCalledWith(
      'admin-1',
      'u-1',
      'Posting schedule',
    );
    expect(limits.clearRestricted).toHaveBeenCalledWith('p-1');
  });

  it('suspending suspends only that Profile for 7 days', async () => {
    await service.resolve('admin-1', 'case-1', 'SUSPENDED');

    expect(strikes.suspendProfile).toHaveBeenCalledWith({
      adminId: 'admin-1',
      userId: 'u-1',
      profileId: 'p-1',
      until: new Date(NOW.getTime() + 7 * DAY_MS),
    });
  });

  it('banning bans only that Profile', async () => {
    await service.resolve('admin-1', 'case-1', 'BANNED');

    expect(strikes.banProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'p-1', userId: 'u-1' }),
    );
  });

  it('refuses to resolve a case that is already resolved', async () => {
    prisma.riskCase.findUnique.mockResolvedValue({
      ...openCase,
      status: 'ACTIONED',
    });

    await expect(
      service.resolve('admin-1', 'case-1', 'BANNED'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.riskCase.updateMany).not.toHaveBeenCalled();
    expect(strikes.banProfile).not.toHaveBeenCalled();
  });

  it('applies nothing when another staff member claimed the case first', async () => {
    prisma.riskCase.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.resolve('admin-1', 'case-1', 'BANNED'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(strikes.banProfile).not.toHaveBeenCalled();
    expect(limits.clearRestricted).not.toHaveBeenCalled();
    expect(audit.execute).not.toHaveBeenCalled();
  });

  it('refuses an unknown case', async () => {
    prisma.riskCase.findUnique.mockResolvedValue(null);
    await expect(
      service.resolve('admin-1', 'nope', 'DISMISSED'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists open cases with the highest score first', async () => {
    prisma.riskCase.count.mockResolvedValue(1);

    const result = await service.list('OPEN', 1, 20);

    expect(prisma.riskCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'OPEN' },
        orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
        skip: 0,
        take: 20,
      }),
    );
    expect(result.meta).toEqual({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('reports precision as actioned over reviewed cases in the last 90 days', async () => {
    prisma.riskCase.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(2);

    expect(await service.stats()).toEqual({
      open: 4,
      reviewedLast90Days: 8,
      actionedLast90Days: 6,
      dismissedLast90Days: 2,
      precision: 0.75,
    });
  });

  it('reports no precision before any review', async () => {
    expect((await service.stats()).precision).toBeNull();
  });
});
