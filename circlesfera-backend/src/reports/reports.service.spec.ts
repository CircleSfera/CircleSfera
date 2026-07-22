/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
import {
  type CreateReportDto,
  ReportTargetType,
} from './dto/create-report.dto.js';
import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrismaService = {
    report: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    post: {
      findUnique: vi.fn(),
    },
    comment: {
      findUnique: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
  };

  const mockAIService = {
    moderateContent: vi.fn(),
  };

  const mockSlackService = {
    sendModerationAlert: vi.fn().mockResolvedValue(undefined),
  };

  const mockNotificationsService = {
    create: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AIService, useValue: mockAIService },
        { provide: SlackService, useValue: mockSlackService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a report without AI moderation for non-content targets', async () => {
      const dto = {
        targetType: ReportTargetType.USER,
        targetId: 'user-1',
        reason: 'SPAM',
        details: 'Spamming on profile',
      };
      mockPrismaService.report.create.mockResolvedValue({ id: '1', ...dto });

      const result = await service.create('user-1', dto as CreateReportDto);
      expect(result.id).toBe('1');
      expect(mockAIService.moderateContent).not.toHaveBeenCalled();
      expect(mockPrismaService.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ details: 'Spamming on profile' }),
        }),
      );
    });

    it('should append AI moderation flags for a flagged POST', async () => {
      const dto = {
        targetType: ReportTargetType.POST,
        targetId: 'post-1',
        reason: 'HATE_SPEECH',
        details: 'Bad words in post',
      };

      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        caption: 'You are awful',
      });
      mockAIService.moderateContent.mockResolvedValue({
        flagged: true,
        categories: { hate: true },
        category_scores: { hate: 0.99 },
      });
      mockPrismaService.report.create.mockResolvedValue({ id: '2' });

      await service.create('user-1', dto as CreateReportDto);

      expect(mockPrismaService.post.findUnique).toHaveBeenCalledWith({
        where: { id: 'post-1' },
      });
      expect(mockAIService.moderateContent).toHaveBeenCalledWith(
        'You are awful',
      );
      expect(mockPrismaService.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // Should contain the original details and the new [AI_FLAGGED] part
            details: expect.stringContaining('Bad words in post'),
          }),
        }),
      );
      // Wait, let's just make sure it contains [AI_FLAGGED]
      const callArg = mockPrismaService.report.create.mock.calls[0][0];
      expect(callArg.data.details).toContain('[AI Automated Flag]');
      expect(callArg.data.details).toContain('hate');
    });

    it('should not append AI flags if POST moderation is clean', async () => {
      const dto = {
        targetType: ReportTargetType.POST,
        targetId: 'post-1',
        reason: 'SPAM',
        details: 'Just spam',
      };

      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        caption: 'Buy my product',
      });
      mockAIService.moderateContent.mockResolvedValue({
        flagged: false,
        categories: {},
        category_scores: {},
      });
      mockPrismaService.report.create.mockResolvedValue({ id: '3' });

      await service.create('user-1', dto as CreateReportDto);

      const callArg = mockPrismaService.report.create.mock.calls[0][0];
      expect(callArg.data.details).toBe('Just spam'); // Should remain unmodified
    });

    it('should gracefully handle if AIService throws an error', async () => {
      const dto = {
        targetType: ReportTargetType.POST,
        targetId: 'post-1',
        reason: 'SPAM',
        details: 'Valid report but AI is down',
      };

      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        caption: 'Buy my product',
      });
      mockAIService.moderateContent.mockRejectedValue(new Error('AI Down'));
      mockPrismaService.report.create.mockResolvedValue({ id: '4' });

      await service.create('user-1', dto as CreateReportDto);

      const callArg = mockPrismaService.report.create.mock.calls[0][0];
      expect(callArg.data.details).toBe('Valid report but AI is down'); // Falls back to normal
    });
  });

  describe('findAll', () => {
    it('should find all reports', async () => {
      mockPrismaService.report.findMany.mockResolvedValue([{ id: '1' }]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
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
      expect(mockNotificationsService.create).toHaveBeenCalled();
    });
  });
});
