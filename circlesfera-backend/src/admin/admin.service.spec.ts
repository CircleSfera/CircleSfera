import { getQueueToken } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { EmailService } from '../email/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminService } from './admin.service.js';

describe('AdminService', () => {
  let service: AdminService;

  const mockPrismaService = {
    adminAuditLog: {
      create: vi.fn(),
    },
    user: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    post: {
      count: vi.fn(),
    },
    story: {
      count: vi.fn(),
    },
    report: {
      count: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
    },
  };

  const mockEmailService = {
    sendEmail: vi.fn(),
  };

  const mockNotificationsService = {
    create: vi.fn(),
  };

  const mockCacheManager = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  };

  const mockQueue = {
    add: vi.fn(),
  };

  const mockAIService = {
    moderateContent: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getQueueToken('ai-processing'), useValue: mockQueue },
        { provide: getQueueToken('analytics-processing'), useValue: mockQueue },
        { provide: AIService, useValue: mockAIService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logAction', () => {
    it('should create an admin audit log entry', async () => {
      mockPrismaService.adminAuditLog.create.mockResolvedValue({ id: 'log-1' });

      await service.logAction(
        'admin-1',
        'BAN_USER' as any,
        'User',
        'user-123',
        'Violation of terms',
      );

      expect(mockPrismaService.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          adminId: 'admin-1',
          action: 'BAN_USER',
          targetType: 'User',
          targetId: 'user-123',
          details: 'Violation of terms',
        },
      });
    });
  });

  describe('getStats', () => {
    it('should return basic platform metrics', async () => {
      mockPrismaService.user.count.mockResolvedValue(150);
      mockPrismaService.post.count.mockResolvedValue(300);
      mockPrismaService.story.count.mockResolvedValue(50);
      mockPrismaService.report.count.mockResolvedValue(5);

      const stats = await service.getStats();

      expect(stats).toEqual({
        users: 150,
        posts: 300,
        stories: 50,
        pendingReports: 5,
      });
    });
  });
});
