import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminProfileSuspensionService } from './admin-profile-suspension.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-05T10:00:00.000Z');

describe('AdminProfileSuspensionService', () => {
  let prisma: {
    profile: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    adminAuditLog: { create: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let strikes: {
    announceSuspension: ReturnType<typeof vi.fn>;
    invalidateProfileCache: ReturnType<typeof vi.fn>;
  };
  let service: AdminProfileSuspensionService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prisma = {
      profile: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'p-1',
          userId: 'u-1',
          isAccountBanned: false,
          suspendedUntil: null,
        }),
        update: vi.fn().mockReturnValue('profile-write'),
      },
      adminAuditLog: { create: vi.fn().mockReturnValue('audit-write') },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    strikes = {
      announceSuspension: vi.fn().mockResolvedValue(undefined),
      invalidateProfileCache: vi.fn().mockResolvedValue(undefined),
    };
    service = new AdminProfileSuspensionService(
      prisma as never,
      strikes as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('suspends that Profile alone for the days given and writes the cause and what was seen in the audit log', async () => {
    const result = await service.suspend('admin-1', 'p-1', {
      cause: 'HARASSMENT',
      days: 14,
      note: '  Published the home address of another person.  ',
    });

    const until = new Date(NOW.getTime() + 14 * DAY_MS);
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: {
        suspendedUntil: until,
        suspensionStrikeId: null,
        suspensionCause: 'HARASSMENT',
      },
    });
    // The suspension and its audit entry are written together.
    expect(prisma.$transaction).toHaveBeenCalledWith([
      'profile-write',
      'audit-write',
    ]);
    expect(strikes.announceSuspension).toHaveBeenCalledWith({
      adminId: 'admin-1',
      userId: 'u-1',
      profileId: 'p-1',
      until,
      cause: 'HARASSMENT',
    });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: 'admin-1',
        action: AdminAction.ACCOUNT_SUSPENDED,
        targetType: 'profile',
        targetId: 'p-1',
        details: `Cause HARASSMENT, until ${until.toISOString()}: Published the home address of another person.`,
      },
    });
    expect(result).toEqual({
      success: true,
      suspendedUntil: until,
      cause: 'HARASSMENT',
    });
  });

  it('refuses a Profile that does not exist, and one that is banned', async () => {
    const input = { cause: 'SCAM' as const, days: 7, note: 'Fake giveaway.' };
    prisma.profile.findUnique.mockResolvedValueOnce(null);
    await expect(service.suspend('admin-1', 'nope', input)).rejects.toThrow(
      NotFoundException,
    );

    prisma.profile.findUnique.mockResolvedValueOnce({
      id: 'p-1',
      userId: 'u-1',
      isAccountBanned: true,
    });
    await expect(service.suspend('admin-1', 'p-1', input)).rejects.toThrow(
      ConflictException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(strikes.announceSuspension).not.toHaveBeenCalled();
  });

  it('tells nobody and ends no session when the suspension could not be written', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.suspend('admin-1', 'p-1', {
        cause: 'SCAM',
        days: 7,
        note: 'Fake giveaway.',
      }),
    ).rejects.toThrow('db down');

    expect(strikes.announceSuspension).not.toHaveBeenCalled();
  });

  it('lifts a running suspension and writes it in the audit log', async () => {
    prisma.profile.findUnique.mockResolvedValueOnce({
      id: 'p-1',
      suspendedUntil: new Date(NOW.getTime() + DAY_MS),
    });

    await expect(service.lift('admin-1', 'p-1')).resolves.toEqual({
      success: true,
    });

    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: {
        suspendedUntil: null,
        suspensionStrikeId: null,
        suspensionCause: null,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      'profile-write',
      'audit-write',
    ]);
    expect(strikes.invalidateProfileCache).toHaveBeenCalledWith(['p-1']);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: 'admin-1',
        action: AdminAction.ACCOUNT_RESTORED,
        targetType: 'profile',
        targetId: 'p-1',
      },
    });
  });

  it('has nothing to lift on a Profile that is not suspended, or whose suspension ran out', async () => {
    await expect(service.lift('admin-1', 'p-1')).rejects.toThrow(
      ConflictException,
    );
    prisma.profile.findUnique.mockResolvedValueOnce({
      id: 'p-1',
      suspendedUntil: new Date(NOW.getTime() - DAY_MS),
    });
    await expect(service.lift('admin-1', 'p-1')).rejects.toThrow(
      ConflictException,
    );
    prisma.profile.findUnique.mockResolvedValueOnce(null);
    await expect(service.lift('admin-1', 'nope')).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
