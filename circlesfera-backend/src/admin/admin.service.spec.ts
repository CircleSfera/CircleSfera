import { getQueueToken } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { CreatorService } from '../creator/creator.service.js';
import { EmailService } from '../email/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
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
      findMany: vi.fn(),
    },
    story: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    comment: {
      findMany: vi.fn(),
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

  const mockCreatorService = {};
  const mockUsersService = {
    syncIdentitySession: vi.fn(),
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
        { provide: CreatorService, useValue: mockCreatorService },
        { provide: UsersService, useValue: mockUsersService },
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

  describe('getModerationQueue', () => {
    it('merges posts, stories, and comments with entityType', async () => {
      const profile = { username: 'alice', avatar: null };
      mockPrismaService.post.findMany.mockResolvedValue([
        {
          id: 'post-1',
          caption: 'hello',
          type: 'FRAME',
          createdAt: new Date('2026-01-02'),
          updatedAt: new Date('2026-01-03'),
          moderationStatus: 'FLAGGED',
          moderationNote: 'note',
          media: [],
          user: { profile },
        },
      ]);
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'story-1',
          url: 'https://cdn/s.jpg',
          thumbnailUrl: null,
          mediaType: 'image',
          createdAt: new Date('2026-01-04'),
          moderationStatus: 'HIDDEN',
          moderationNote: null,
          user: { profile },
        },
      ]);
      mockPrismaService.comment.findMany.mockResolvedValue([
        {
          id: 'c-1',
          content: 'bad',
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          moderationStatus: 'FLAGGED',
          moderationNote: null,
          user: { profile },
        },
      ]);

      const result = await service.getModerationQueue(1, 10);

      expect(result.meta.total).toBe(3);
      expect(
        result.data.map((i: { entityType: string }) => i.entityType),
      ).toEqual(['STORY', 'POST', 'COMMENT']);
      expect(result.data[1].entityType).toBe('POST');
      expect(result.data[1].type).toBe('FRAME');
    });

    it('filters by STORY entity type only', async () => {
      mockPrismaService.post.findMany.mockClear();
      mockPrismaService.story.findMany.mockResolvedValue([]);
      mockPrismaService.comment.findMany.mockClear();

      await service.getModerationQueue(1, 10, 'STORY');

      expect(mockPrismaService.post.findMany).not.toHaveBeenCalled();
      expect(mockPrismaService.comment.findMany).not.toHaveBeenCalled();
      expect(mockPrismaService.story.findMany).toHaveBeenCalled();
    });
  });
});
