/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportTargetType } from './dto/create-report.dto.js';
import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrismaService = {
    report: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    post: { findUnique: vi.fn() },
    comment: { findUnique: vi.fn() },
    profile: { findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    story: { findUnique: vi.fn() },
    message: { findUnique: vi.fn() },
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should handle USER target type existence check', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(
        service.create('reporter-1', {
          targetType: ReportTargetType.USER,
          targetId: 'u-missing',
          reason: 'HARASSMENT',
        } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u-ok' });
      mockPrismaService.report.create.mockResolvedValue({ id: 'rep-u' });
      const res = await service.create('reporter-1', {
        targetType: ReportTargetType.USER,
        targetId: 'u-ok',
        reason: 'HARASSMENT',
      } as any);
      expect(res.id).toBe('rep-u');
    });

    it('should throw AppException if target post does not exist', async () => {
      const dto = {
        targetType: ReportTargetType.POST,
        targetId: 'invalid-post',
        reason: 'SPAM',
      };
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.create('user-1', dto as any)).rejects.toThrow(
        AppException,
      );
    });

    it('should create a report for a valid POST', async () => {
      const dto = {
        targetType: ReportTargetType.POST,
        targetId: 'post-1',
        reason: 'SPAM',
        details: 'Bad post',
      };
      mockPrismaService.post.findUnique.mockResolvedValue({ id: 'post-1' });
      mockPrismaService.report.create.mockResolvedValue({ id: '1', ...dto });

      const result = await service.create('user-1', dto as any);
      expect(result.id).toBe('1');
      expect(mockPrismaService.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ details: 'Bad post' }),
        }),
      );
    });

    it('should handle STORY target type existence check', async () => {
      mockPrismaService.story.findUnique.mockResolvedValue(null);
      await expect(
        service.create('reporter-1', {
          targetType: ReportTargetType.STORY,
          targetId: 'story-missing',
          reason: 'NUDITY',
        } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.story.findUnique.mockResolvedValue({ id: 'story-ok' });
      mockPrismaService.report.create.mockResolvedValue({ id: 'rep-s' });
      const res = await service.create('reporter-1', {
        targetType: ReportTargetType.STORY,
        targetId: 'story-ok',
        reason: 'NUDITY',
      } as any);
      expect(res.id).toBe('rep-s');
    });

    it('should handle COMMENT target type existence check', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(null);
      await expect(
        service.create('reporter-1', {
          targetType: ReportTargetType.COMMENT,
          targetId: 'c-missing',
          reason: 'HATE_SPEECH',
        } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.comment.findUnique.mockResolvedValue({ id: 'c-ok' });
      mockPrismaService.report.create.mockResolvedValue({ id: 'rep-c' });
      const res = await service.create('reporter-1', {
        targetType: ReportTargetType.COMMENT,
        targetId: 'c-ok',
        reason: 'HATE_SPEECH',
      } as any);
      expect(res.id).toBe('rep-c');
    });

    it('should handle MESSAGE target type existence check', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue(null);
      await expect(
        service.create('reporter-1', {
          targetType: ReportTargetType.MESSAGE,
          targetId: 'm-missing',
          reason: 'SCAM',
        } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.message.findUnique.mockResolvedValue({ id: 'm-ok' });
      mockPrismaService.report.create.mockResolvedValue({ id: 'rep-m' });
      const res = await service.create('reporter-1', {
        targetType: ReportTargetType.MESSAGE,
        targetId: 'm-ok',
        reason: 'SCAM',
      } as any);
      expect(res.id).toBe('rep-m');
    });

    it('should emit a moderation.report_filed event on report creation', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrismaService.report.create.mockResolvedValue({ id: 'rep-slack' });

      const res = await service.create('reporter-1', {
        targetType: ReportTargetType.POST,
        targetId: 'p-1',
        reason: 'SPAM',
      } as any);
      expect(res.id).toBe('rep-slack');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'moderation.report_filed',
        expect.objectContaining({
          reportId: 'rep-slack',
          reporterId: 'reporter-1',
          targetType: ReportTargetType.POST,
          targetId: 'p-1',
          reason: 'SPAM',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should find all reports paginated with defaults', async () => {
      mockPrismaService.report.findMany.mockResolvedValue([{ id: '1' }]);
      mockPrismaService.report.count.mockResolvedValue(1);
      const result = await service.findAll({} as any);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.report.findMany).toHaveBeenCalled();
    });
  });

  describe('findMyReports', () => {
    it('should find my reports paginated with defaults', async () => {
      mockPrismaService.report.findMany.mockResolvedValue([{ id: '1' }]);
      mockPrismaService.report.count.mockResolvedValue(1);
      const result = await service.findMyReports('user-1', {} as any);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.report.findMany).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update report status and emit notification with adminId', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: '1',
        status: 'PENDING',
        reporterId: 'reporter-1',
        targetType: 'POST',
        targetId: 'post-1',
      });
      mockPrismaService.report.update.mockResolvedValue({
        id: '1',
        status: 'RESOLVED',
      });
      const result = await service.update(
        '1',
        'RESOLVED' as any,
        'custom-admin',
      );
      expect(result.status).toBe('RESOLVED');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'reporter-1',
          senderId: 'custom-admin',
          postId: 'post-1',
        }),
      );
    });

    it('should update report status and resolve system moderator when adminId not passed', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: '2',
        status: 'PENDING',
        reporterId: 'reporter-2',
        targetType: 'USER',
        targetId: 'target-u2',
      });
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'admin-auto',
        profiles: [{ id: 'admin-profile-auto' }],
      });
      mockPrismaService.report.update.mockResolvedValue({
        id: '2',
        status: 'DISMISSED',
      });
      const result = await service.update('2', 'DISMISSED' as any);
      expect(result.status).toBe('DISMISSED');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'reporter-2',
          senderId: 'admin-profile-auto',
          postId: undefined,
        }),
      );
    });

    it('should not emit notification if status did not change or no senderId resolved', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: '3',
        status: 'RESOLVED',
        reporterId: 'reporter-3',
        targetType: 'POST',
        targetId: 'post-3',
      });
      mockPrismaService.report.update.mockResolvedValue({
        id: '3',
        status: 'RESOLVED',
      });
      await service.update('3', 'RESOLVED' as any);
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();

      // Test when status changes but resolveSystemModeratorActor returns null
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: '4',
        status: 'PENDING',
        reporterId: 'reporter-4',
        targetType: 'POST',
        targetId: 'post-4',
      });
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.report.update.mockResolvedValue({
        id: '4',
        status: 'RESOLVED',
      });
      await service.update('4', 'RESOLVED' as any);
    });

    it('should throw AppException if report is not found', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue(null);
      await expect(
        service.update('invalid-id', 'RESOLVED' as any),
      ).rejects.toThrow(AppException);
    });
  });
});
