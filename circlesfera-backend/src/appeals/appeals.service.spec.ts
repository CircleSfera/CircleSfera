import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../email/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfileStrikesService } from '../strikes/profile-strikes.service.js';
import { ActionLimitsService } from '../trust/action-limits.service.js';
import { RiskDetectorService } from '../trust/risk-detector.service.js';
import { AppealsService } from './appeals.service.js';

describe('AppealsService', () => {
  let service: AppealsService;

  const mockPrismaService = {
    appeal: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    post: { findFirst: vi.fn(), update: vi.fn() },
    profile: { findFirst: vi.fn(), findMany: vi.fn() },
    profileStrike: { findFirst: vi.fn(), findUnique: vi.fn() },
    riskCase: { findFirst: vi.fn(), findUnique: vi.fn() },
    user: { update: vi.fn(), findUnique: vi.fn() },
    adminIdentity: { findUnique: vi.fn() },
    adminAuditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };

  const mockActionLimits = {
    clearRestricted: vi.fn(),
  };

  const mockRiskDetector = {
    liftRestrictionForAppeal: vi.fn(),
  };

  const mockStrikesService = {
    revokeForAppeal: vi.fn(),
    liftRestrictionForAppeal: vi.fn(),
    invalidateProfileCache: vi.fn(),
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  const mockEmailService = {
    sendTemplatedEmail: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppealsService,
        { provide: ActionLimitsService, useValue: mockActionLimits },
        { provide: RiskDetectorService, useValue: mockRiskDetector },
        {
          provide: NotificationsService,
          useValue: { create: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: ProfileStrikesService, useValue: mockStrikesService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AppealsService>(AppealsService);
    vi.clearAllMocks();
    mockPrismaService.appeal.findFirst.mockResolvedValue(null);
    mockPrismaService.adminAuditLog.create.mockResolvedValue({});
    mockPrismaService.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrismaService) => unknown) =>
        fn(mockPrismaService),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an appeal and emit a moderation.report_filed event', async () => {
      const dto = {
        targetType: 'ACCOUNT_BAN' as any,
        targetId: 'ban-1',
        reason: 'Unfair ban, I did not break rules',
      };
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: 'ban-1' });

      mockPrismaService.appeal.create.mockResolvedValue({
        id: 'appeal-1',
        userId: 'user-1',
        ...dto,
      });

      const result = await service.create('user-1', dto);
      expect(mockPrismaService.appeal.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason,
        },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'moderation.report_filed',
        expect.objectContaining({
          reportId: 'appeal-1',
          reporterId: 'user-1',
          targetType: dto.targetType,
          targetId: dto.targetId,
        }),
      );
      expect(result).toHaveProperty('id', 'appeal-1');
    });

    it('refuses an appeal about a post of another account', async () => {
      mockPrismaService.post.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          targetType: 'POST_REMOVAL' as any,
          targetId: 'someone-elses-post',
          reason: 'Please restore this post now',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.post.findFirst).toHaveBeenCalledWith({
        where: { id: 'someone-elses-post', profile: { userId: 'user-1' } },
        select: { id: true },
      });
      expect(mockPrismaService.appeal.create).not.toHaveBeenCalled();
    });

    it('refuses an appeal about a strike of another account', async () => {
      mockPrismaService.profileStrike.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          targetType: 'STRIKE' as any,
          targetId: 'strike-of-someone-else',
          reason: 'This strike is not fair at all',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.appeal.create).not.toHaveBeenCalled();
    });

    it('a login-screen appeal about a strike must concern the restricted Profile', async () => {
      mockPrismaService.profileStrike.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          'user-1',
          {
            targetType: 'STRIKE' as any,
            targetId: 'strike-of-other-profile',
            reason: 'This strike is not fair at all',
          },
          'profile-restricted',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.profileStrike.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'strike-of-other-profile',
          profile: { userId: 'user-1' },
          profileId: 'profile-restricted',
        },
        select: { id: true },
      });
    });

    it('serializes appeals of one account before the pending check', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: 'p-1' });
      mockPrismaService.appeal.create.mockResolvedValue({ id: 'appeal-1' });

      await service.create('user-1', {
        targetType: 'ACCOUNT_BAN' as any,
        targetId: 'p-1',
        reason: 'Please review this ban',
      });

      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1);
      const lockOrder = mockPrismaService.$queryRaw.mock.invocationCallOrder[0];
      const checkOrder =
        mockPrismaService.appeal.findFirst.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(checkOrder);
    });

    it('refuses an appeal about a restriction of another account', async () => {
      mockPrismaService.riskCase.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          targetType: 'RESTRICTION' as any,
          targetId: 'case-of-someone-else',
          reason: 'I am a real person, please review',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.riskCase.findFirst).toHaveBeenCalledWith({
        where: { id: 'case-of-someone-else', profile: { userId: 'user-1' } },
        select: { id: true },
      });
    });

    it('refuses a second pending appeal about the same decision', async () => {
      mockPrismaService.profileStrike.findFirst.mockResolvedValue({
        id: 'strike-1',
      });
      mockPrismaService.appeal.findFirst.mockResolvedValue({ id: 'appeal-0' });

      await expect(
        service.create('user-1', {
          targetType: 'STRIKE' as any,
          targetId: 'strike-1',
          reason: 'This strike is not fair at all',
        }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrismaService.appeal.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const pendingAppeal = (overrides: Record<string, unknown>) => ({
      id: 'appeal-1',
      userId: 'user-1',
      status: 'PENDING',
      resolvedAt: null,
      user: { profiles: [] },
      ...overrides,
    });

    beforeEach(() => {
      mockStrikesService.revokeForAppeal.mockResolvedValue('profile-1');
      mockPrismaService.appeal.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'appeal-1',
          ...data,
        }),
      );
      mockPrismaService.adminIdentity.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.profileStrike.findUnique.mockResolvedValue({
        profileId: 'profile-1',
      });
    });

    it('approving a strike appeal withdraws that strike', async () => {
      mockPrismaService.appeal.findUnique.mockResolvedValue(
        pendingAppeal({ targetType: 'STRIKE', targetId: 'strike-1' }),
      );

      await service.update(
        'appeal-1',
        { status: 'APPROVED' as any },
        'admin-1',
      );

      expect(mockStrikesService.revokeForAppeal).toHaveBeenCalledWith(
        mockPrismaService,
        'strike-1',
      );
      expect(mockStrikesService.invalidateProfileCache).toHaveBeenCalledWith([
        'profile-1',
      ]);
      expect(
        mockStrikesService.liftRestrictionForAppeal,
      ).not.toHaveBeenCalled();
    });

    it('approving a restriction appeal lifts the reduced caps', async () => {
      mockRiskDetector.liftRestrictionForAppeal.mockResolvedValue('profile-1');
      mockPrismaService.riskCase.findUnique.mockResolvedValue({
        profileId: 'profile-1',
      });
      mockPrismaService.appeal.findUnique.mockResolvedValue(
        pendingAppeal({ targetType: 'RESTRICTION', targetId: 'case-1' }),
      );

      await service.update(
        'appeal-1',
        { status: 'APPROVED' as any },
        'admin-1',
      );

      expect(mockRiskDetector.liftRestrictionForAppeal).toHaveBeenCalledWith(
        mockPrismaService,
        'case-1',
      );
      expect(mockActionLimits.clearRestricted).toHaveBeenCalledWith(
        'profile-1',
      );
    });

    it('rejecting a strike appeal keeps the strike', async () => {
      mockPrismaService.appeal.findUnique.mockResolvedValue(
        pendingAppeal({ targetType: 'STRIKE', targetId: 'strike-1' }),
      );

      await service.update(
        'appeal-1',
        { status: 'REJECTED' as any },
        'admin-1',
      );

      expect(mockStrikesService.revokeForAppeal).not.toHaveBeenCalled();
    });

    it('approving a ban appeal lifts the restriction of that Profile only', async () => {
      mockPrismaService.appeal.findUnique.mockResolvedValue(
        pendingAppeal({ targetType: 'ACCOUNT_BAN', targetId: 'profile-2' }),
      );

      await service.update(
        'appeal-1',
        { status: 'APPROVED' as any },
        'admin-1',
      );

      expect(mockStrikesService.liftRestrictionForAppeal).toHaveBeenCalledTimes(
        1,
      );
      expect(mockStrikesService.liftRestrictionForAppeal).toHaveBeenCalledWith(
        mockPrismaService,
        'profile-2',
      );
      expect(mockPrismaService.profile.findMany).not.toHaveBeenCalled();
    });

    it('approving an already approved appeal does not repeat its effects', async () => {
      mockPrismaService.appeal.findUnique.mockResolvedValue(
        pendingAppeal({
          targetType: 'STRIKE',
          targetId: 'strike-1',
          status: 'APPROVED',
        }),
      );

      await service.update(
        'appeal-1',
        { status: 'APPROVED' as any },
        'admin-1',
      );

      expect(mockStrikesService.revokeForAppeal).not.toHaveBeenCalled();
    });
  });

  describe('findMyUserAppeals', () => {
    it('should return appeals for specified user', async () => {
      mockPrismaService.appeal.findMany.mockResolvedValue([
        { id: 'appeal-1', userId: 'user-1' },
      ]);

      const result = await service.findMyUserAppeals('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if appeal does not exist', async () => {
      mockPrismaService.appeal.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-appeal')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return appeal if exists', async () => {
      mockPrismaService.appeal.findUnique.mockResolvedValue({
        id: 'appeal-1',
        userId: 'user-1',
      });

      const result = await service.findOne('appeal-1');
      expect(result).toHaveProperty('id', 'appeal-1');
    });
  });
});
