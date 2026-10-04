import { NotificationType } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeStrikeRecordWhere,
  STRIKE_EXPIRY_DAYS,
  STRIKE_SUSPENSION_DAYS,
} from './profile-strikes.constants.js';
import { ProfileStrikesService } from './profile-strikes.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-04T12:00:00.000Z');

describe('ProfileStrikesService', () => {
  let tx: {
    $queryRaw: ReturnType<typeof vi.fn>;
    profileStrike: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    profile: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  let prisma: typeof tx & {
    $transaction: ReturnType<typeof vi.fn>;
    adminIdentity: { findUnique: ReturnType<typeof vi.fn> };
  };
  let notifications: { create: ReturnType<typeof vi.fn> };
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };
  let service: ProfileStrikesService;

  const violation = {
    adminId: 'admin-1',
    profileId: 'profile-1',
    userId: 'user-1',
    reportId: 'report-1',
    reason: 'HARASSMENT' as const,
  };

  // Active records the Profile already has when the violation is applied.
  const withActive = (kinds: Array<'WARNING' | 'STRIKE'>) =>
    tx.profileStrike.findMany.mockResolvedValue(
      kinds.map((kind) => ({ kind })),
    );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'profile-1' }]),
      profileStrike: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        create: vi.fn(async ({ data }) => ({ id: 'strike-new', ...data })),
        update: vi.fn().mockResolvedValue({}),
      },
      profile: {
        findUnique: vi.fn().mockResolvedValue({ suspendedUntil: null }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma = {
      ...tx,
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
      adminIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    notifications = { create: vi.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: vi.fn() };
    service = new ProfileStrikesService(
      prisma as never,
      notifications as never,
      eventEmitter as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('applyViolation', () => {
    it('locks the Profile row and counts only records that are still active', async () => {
      await service.applyViolation(violation);

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.profileStrike.findMany).toHaveBeenCalledWith({
        where: { profileId: 'profile-1', ...activeStrikeRecordWhere(NOW) },
        select: { kind: true },
      });
    });

    it('a first violation with nothing active is a warning with no consequence', async () => {
      withActive([]);

      const result = await service.applyViolation(violation);

      expect(tx.profileStrike.create).toHaveBeenCalledWith({
        data: {
          profileId: 'profile-1',
          kind: 'WARNING',
          reason: 'HARASSMENT',
          consequence: 'NONE',
          reportId: 'report-1',
          adminId: 'admin-1',
          createdAt: NOW,
          expiresAt: new Date(NOW.getTime() + STRIKE_EXPIRY_DAYS * DAY_MS),
        },
      });
      expect(result?.activeStrikes).toBe(0);
      expect(tx.profile.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'profile-1',
          type: NotificationType.MODERATION,
          targetType: 'profile_warning',
          targetId: 'strike-new',
          content: expect.stringContaining('no penalty'),
        }),
      );
    });

    it('a violation after an active warning is strike 1, with no consequence', async () => {
      withActive(['WARNING']);

      const result = await service.applyViolation(violation);

      expect(tx.profileStrike.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'STRIKE', consequence: 'NONE' }),
      });
      expect(result?.activeStrikes).toBe(1);
      expect(tx.profile.update).not.toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: 'profile_strike',
          content: expect.stringContaining('Strike 1 of 3'),
        }),
      );
    });

    it('the second active strike suspends the Profile for 7 days and ends its sessions', async () => {
      withActive(['WARNING', 'STRIKE']);

      const result = await service.applyViolation(violation);

      const until = new Date(NOW.getTime() + STRIKE_SUSPENSION_DAYS * DAY_MS);
      expect(tx.profileStrike.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'STRIKE',
          consequence: 'SUSPENDED',
        }),
      });
      expect(tx.profile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: { suspendedUntil: until },
      });
      expect(result?.suspendedUntil).toEqual(until);
      expect(eventEmitter.emit).toHaveBeenCalledWith('user.session.terminate', {
        userId: 'user-1',
        profileId: 'profile-1',
        reason: expect.any(String),
        scope: 'profile',
      });
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'profile_suspension' }),
      );
    });

    it('a strike never shortens a longer suspension that is already running', async () => {
      withActive(['STRIKE']);
      const longer = new Date(NOW.getTime() + 30 * DAY_MS);
      tx.profile.findUnique.mockResolvedValue({ suspendedUntil: longer });

      await service.applyViolation(violation);

      expect(tx.profile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: { suspendedUntil: longer },
      });
    });

    it('the third active strike bans only that Profile', async () => {
      withActive(['STRIKE', 'STRIKE']);

      const result = await service.applyViolation(violation);

      expect(result?.activeStrikes).toBe(3);
      expect(tx.profileStrike.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'STRIKE',
          consequence: 'BANNED',
        }),
      });
      expect(tx.profile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: {
          isAccountBanned: true,
          accountBanReason: expect.stringContaining('3 active strikes'),
        },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.session.terminate',
        expect.objectContaining({ profileId: 'profile-1', scope: 'profile' }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: 'profile_ban',
          content: expect.stringContaining('other profiles are not affected'),
        }),
      );
    });

    it('resolving the same report again adds nothing', async () => {
      tx.profileStrike.findFirst.mockResolvedValue({ id: 'strike-old' });

      const result = await service.applyViolation(violation);

      expect(result).toBeNull();
      expect(tx.profileStrike.create).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('does not end sessions when the Profile owner is unknown', async () => {
      withActive(['STRIKE', 'STRIKE']);

      await service.applyViolation({ ...violation, userId: null });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('banProfile', () => {
    it('bans the Profile at once and ends only its sessions', async () => {
      await service.banProfile({
        adminId: 'admin-1',
        userId: 'user-1',
        profileId: 'profile-1',
        reason: 'Severe violation',
      });

      expect(prisma.profile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: { isAccountBanned: true, accountBanReason: 'Severe violation' },
      });
      expect(prisma.profileStrike.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.session.terminate',
        expect.objectContaining({ profileId: 'profile-1', scope: 'profile' }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'profile_ban' }),
      );
    });
  });

  describe('listForProfile', () => {
    it('labels each record as active, expired or revoked', async () => {
      const base = {
        kind: 'STRIKE',
        reason: 'SPAM',
        consequence: 'NONE',
        createdAt: new Date(NOW.getTime() - DAY_MS),
      };
      prisma.profileStrike.findMany.mockResolvedValue([
        {
          ...base,
          id: 'a',
          expiresAt: new Date(NOW.getTime() + DAY_MS),
          revokedAt: null,
        },
        {
          ...base,
          id: 'b',
          expiresAt: new Date(NOW.getTime() - 1),
          revokedAt: null,
        },
        {
          ...base,
          id: 'c',
          expiresAt: new Date(NOW.getTime() + DAY_MS),
          revokedAt: NOW,
        },
      ]);

      const rows = await service.listForProfile('profile-1');

      expect(rows.map((r) => [r.id, r.status])).toEqual([
        ['a', 'ACTIVE'],
        ['b', 'EXPIRED'],
        ['c', 'REVOKED'],
      ]);
    });
  });

  describe('revokeForAppeal', () => {
    it('withdraws the strike and lifts the ban it caused', async () => {
      tx.profileStrike.findUnique.mockResolvedValue({
        id: 'strike-1',
        profileId: 'profile-1',
        consequence: 'BANNED',
        revokedAt: null,
      });

      await service.revokeForAppeal(tx as never, 'strike-1');

      expect(tx.profileStrike.update).toHaveBeenCalledWith({
        where: { id: 'strike-1' },
        data: { revokedAt: NOW },
      });
      expect(tx.profile.updateMany).toHaveBeenCalledWith({
        where: { id: 'profile-1', isAccountBanned: true },
        data: { isAccountBanned: false, accountBanReason: null },
      });
    });

    it('withdraws the strike and lifts the suspension it caused if still running', async () => {
      tx.profileStrike.findUnique.mockResolvedValue({
        id: 'strike-1',
        profileId: 'profile-1',
        consequence: 'SUSPENDED',
        revokedAt: null,
      });

      await service.revokeForAppeal(tx as never, 'strike-1');

      expect(tx.profile.updateMany).toHaveBeenCalledWith({
        where: { id: 'profile-1', suspendedUntil: { gt: NOW } },
        data: { suspendedUntil: null },
      });
    });

    it('does nothing for a strike that is already withdrawn', async () => {
      tx.profileStrike.findUnique.mockResolvedValue({
        id: 'strike-1',
        profileId: 'profile-1',
        consequence: 'BANNED',
        revokedAt: NOW,
      });

      await service.revokeForAppeal(tx as never, 'strike-1');

      expect(tx.profileStrike.update).not.toHaveBeenCalled();
      expect(tx.profile.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('liftRestrictionForAppeal', () => {
    it('withdraws the strike that caused the restriction and clears it', async () => {
      tx.profileStrike.findFirst.mockResolvedValue({ id: 'strike-3' });

      await service.liftRestrictionForAppeal(tx as never, 'profile-1');

      expect(tx.profileStrike.update).toHaveBeenCalledWith({
        where: { id: 'strike-3' },
        data: { revokedAt: NOW },
      });
      expect(tx.profile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: {
          isAccountBanned: false,
          accountBanReason: null,
          suspendedUntil: null,
        },
      });
    });

    it('clears a direct ban that no strike caused', async () => {
      tx.profileStrike.findFirst.mockResolvedValue(null);

      await service.liftRestrictionForAppeal(tx as never, 'profile-1');

      expect(tx.profileStrike.update).not.toHaveBeenCalled();
      expect(tx.profile.update).toHaveBeenCalledTimes(1);
    });
  });
});
