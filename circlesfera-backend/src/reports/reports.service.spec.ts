/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
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
    user: { findFirst: vi.fn() },
    story: { findUnique: vi.fn() },
    message: { findUnique: vi.fn() },
  };

  const mockSlackService = {
    sendModerationAlert: vi.fn().mockResolvedValue(undefined),
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SlackService, useValue: mockSlackService },
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
    it('should throw AppException if target entity does not exist', async () => {
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
  });

  describe('findAll', () => {
    it('should find all reports paginated', async () => {
      mockPrismaService.report.findMany.mockResolvedValue([{ id: '1' }]);
      mockPrismaService.report.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.report.findMany).toHaveBeenCalled();
    });
  });

  describe('findMyReports', () => {
    it('should find my reports paginated', async () => {
      mockPrismaService.report.findMany.mockResolvedValue([{ id: '1' }]);
      mockPrismaService.report.count.mockResolvedValue(1);
      const result = await service.findMyReports('user-1', {
        page: 1,
        limit: 10,
      });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.report.findMany).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update report status', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: '1',
        status: 'PENDING',
        reporterId: 'reporter-1',
        targetType: 'POST',
        targetId: 'post-1',
      });
      mockPrismaService.user.findFirst.mockResolvedValue({ id: 'admin-1' });
      mockPrismaService.report.update.mockResolvedValue({
        id: '1',
        status: 'RESOLVED',
      });
      const result = await service.update('1', 'RESOLVED');
      expect(result.status).toBe('RESOLVED');
      expect(mockPrismaService.report.update).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalled();
    });

    it('should throw AppException if report is not found', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue(null);
      await expect(service.update('invalid-id', 'RESOLVED')).rejects.toThrow(
        AppException,
      );
    });
  });
});
