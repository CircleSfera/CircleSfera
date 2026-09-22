import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { MaintenanceService } from './maintenance.service.js';

describe('MaintenanceService', () => {
  let service: MaintenanceService;

  const mockPrismaService = {
    story: {
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    promotion: {
      updateMany: vi.fn(),
    },
    searchHistory: {
      deleteMany: vi.fn(),
    },
    report: {
      deleteMany: vi.fn(),
    },
    webhookEvent: {
      deleteMany: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    post: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    deviceSignal: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };

  const mockUploadsService = {
    deleteFile: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: UploadsService, useValue: mockUploadsService },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cleanupExpiredStories', () => {
    it('should return early if no expired stories exist', async () => {
      mockPrismaService.story.findMany.mockResolvedValue([]);

      await service.cleanupExpiredStories();
      expect(mockPrismaService.story.findMany).toHaveBeenCalled();
      expect(mockUploadsService.deleteFile).not.toHaveBeenCalled();
    });

    it('should delete expired story media and records', async () => {
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 's-1',
          url: 'https://cdn.example.com/story.jpg',
          thumbnailUrl: 'https://cdn.example.com/story_thumb.jpg',
        },
      ]);
      mockPrismaService.story.delete.mockResolvedValue({ id: 's-1' });

      await service.cleanupExpiredStories();
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/story.jpg',
      );
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/story_thumb.jpg',
      );
      expect(mockPrismaService.story.delete).toHaveBeenCalledWith({
        where: { id: 's-1' },
      });
    });

    it('should handle media deletion failures and story delete exceptions in loop', async () => {
      mockUploadsService.deleteFile.mockRejectedValue(
        new Error('Upload error'),
      );
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 's-err',
          url: 'https://cdn.example.com/story.jpg',
          thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        },
      ]);
      mockPrismaService.story.delete.mockRejectedValueOnce(
        new Error('DB delete failure'),
      );

      await expect(service.cleanupExpiredStories()).resolves.not.toThrow();
    });

    it('should catch top-level database failures gracefully', async () => {
      mockPrismaService.story.findMany.mockRejectedValueOnce(
        new Error('Connection error'),
      );
      await expect(service.cleanupExpiredStories()).resolves.not.toThrow();
    });
  });

  describe('checkExpiredPromotions', () => {
    it('should update status for expired promotions and log when count > 0', async () => {
      mockPrismaService.promotion.updateMany.mockResolvedValue({ count: 2 });

      await service.checkExpiredPromotions();
      expect(mockPrismaService.promotion.updateMany).toHaveBeenCalled();
    });

    it('should handle 0 count updated promotions', async () => {
      mockPrismaService.promotion.updateMany.mockResolvedValue({ count: 0 });

      await service.checkExpiredPromotions();
      expect(mockPrismaService.promotion.updateMany).toHaveBeenCalled();
    });

    it('should catch database errors gracefully', async () => {
      mockPrismaService.promotion.updateMany.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.checkExpiredPromotions()).resolves.not.toThrow();
    });
  });

  describe('cleanupOldSearchHistory', () => {
    it('should delete old search history and log when count > 0', async () => {
      mockPrismaService.searchHistory.deleteMany.mockResolvedValue({
        count: 5,
      });

      await service.cleanupOldSearchHistory();
      expect(mockPrismaService.searchHistory.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { expiresAt: { not: null, lte: expect.any(Date) } },
            { expiresAt: null, createdAt: { lt: expect.any(Date) } },
          ],
        },
      });
    });

    it('should handle 0 count deleted records', async () => {
      mockPrismaService.searchHistory.deleteMany.mockResolvedValue({
        count: 0,
      });
      await service.cleanupOldSearchHistory();
      expect(mockPrismaService.searchHistory.deleteMany).toHaveBeenCalled();
    });

    it('should catch errors gracefully', async () => {
      mockPrismaService.searchHistory.deleteMany.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.cleanupOldSearchHistory()).resolves.not.toThrow();
    });
  });

  describe('purgeOldResolvedReports', () => {
    it('should delete old resolved and rejected reports', async () => {
      mockPrismaService.report.deleteMany.mockResolvedValue({ count: 3 });

      await service.purgeOldResolvedReports();
      expect(mockPrismaService.report.deleteMany).toHaveBeenCalledWith({
        where: {
          status: { in: ['RESOLVED', 'REJECTED'] },
          OR: [
            { resolvedAt: { not: null, lt: expect.any(Date) } },
            { resolvedAt: null, updatedAt: { lt: expect.any(Date) } },
          ],
        },
      });
    });

    it('should handle count = 0', async () => {
      mockPrismaService.report.deleteMany.mockResolvedValue({ count: 0 });
      await service.purgeOldResolvedReports();
      expect(mockPrismaService.report.deleteMany).toHaveBeenCalled();
    });

    it('should catch errors gracefully', async () => {
      mockPrismaService.report.deleteMany.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.purgeOldResolvedReports()).resolves.not.toThrow();
    });
  });

  describe('purgeOldWebhookEvents', () => {
    it('should delete webhook events older than 30 days', async () => {
      mockPrismaService.webhookEvent.deleteMany.mockResolvedValue({
        count: 10,
      });

      await service.purgeOldWebhookEvents();
      expect(mockPrismaService.webhookEvent.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: { lt: expect.any(Date) },
        },
      });
    });

    it('should handle count = 0', async () => {
      mockPrismaService.webhookEvent.deleteMany.mockResolvedValue({ count: 0 });
      await service.purgeOldWebhookEvents();
      expect(mockPrismaService.webhookEvent.deleteMany).toHaveBeenCalled();
    });

    it('should catch errors gracefully', async () => {
      mockPrismaService.webhookEvent.deleteMany.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.purgeOldWebhookEvents()).resolves.not.toThrow();
    });
  });

  describe('liftExpiredSuspensions', () => {
    it('should return early when no expired suspensions found', async () => {
      mockPrismaService.profile.findMany.mockResolvedValue([]);

      await service.liftExpiredSuspensions();
      expect(mockPrismaService.profile.findMany).toHaveBeenCalled();
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should lift expired suspensions and reactivate users in transaction', async () => {
      mockPrismaService.profile.findMany.mockResolvedValue([
        { id: 'prof-1', userId: 'user-1' },
        { id: 'prof-2', userId: 'user-1' },
      ]);
      mockPrismaService.profile.updateMany.mockReturnValue(
        'updateProfilesQuery',
      );
      mockPrismaService.user.updateMany.mockReturnValue('updateUsersQuery');

      await service.liftExpiredSuspensions();
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should catch errors gracefully', async () => {
      mockPrismaService.profile.findMany.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.liftExpiredSuspensions()).resolves.not.toThrow();
    });
  });

  describe('purgeGdprDeletedUsers', () => {
    it('should return early if no users pending GDPR hard deletion', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.purgeGdprDeletedUsers();
      expect(mockPrismaService.user.findMany).toHaveBeenCalled();
      expect(mockPrismaService.user.delete).not.toHaveBeenCalled();
    });

    it('should permanently delete users soft-deleted > 30 days ago and all media files', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([
        {
          id: 'deleted-user-1',
          profiles: [
            {
              avatar: 'https://cdn.example.com/avatar.jpg',
              standardUrl: 'https://cdn.example.com/std.jpg',
              thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
              cover: 'https://cdn.example.com/cover.jpg',
              coverStandardUrl: 'https://cdn.example.com/cover-std.jpg',
            },
          ],
        },
      ]);
      mockPrismaService.user.delete.mockResolvedValue({ id: 'deleted-user-1' });

      await service.purgeGdprDeletedUsers();

      expect(mockPrismaService.user.findMany).toHaveBeenCalled();
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/avatar.jpg',
      );
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/cover-std.jpg',
      );
      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
        where: { id: 'deleted-user-1' },
      });
    });

    it('should handle media deletion failure and user delete error in loop', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([
        {
          id: 'deleted-user-err',
          profiles: [
            {
              avatar: 'https://cdn.example.com/avatar.jpg',
            },
          ],
        },
      ]);
      mockUploadsService.deleteFile.mockRejectedValueOnce(
        new Error('S3 error'),
      );
      mockPrismaService.user.delete.mockRejectedValueOnce(
        new Error('DB delete fail'),
      );

      await expect(service.purgeGdprDeletedUsers()).resolves.not.toThrow();
    });

    it('should catch top-level errors gracefully', async () => {
      mockPrismaService.user.findMany.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.purgeGdprDeletedUsers()).resolves.not.toThrow();
    });
  });

  describe('publishScheduledPosts', () => {
    it('should return early when no scheduled posts or stories exist', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([]);
      mockPrismaService.story.findMany.mockResolvedValue([]);

      await service.publishScheduledPosts();
      expect(mockPrismaService.post.update).not.toHaveBeenCalled();
      expect(mockPrismaService.story.update).not.toHaveBeenCalled();
    });

    it('should publish scheduled posts and stories', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([{ id: 'post-1' }]);
      mockPrismaService.story.findMany.mockResolvedValue([{ id: 'story-1' }]);
      mockPrismaService.post.update.mockResolvedValue({ id: 'post-1' });
      mockPrismaService.story.update.mockResolvedValue({ id: 'story-1' });

      await service.publishScheduledPosts();

      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: expect.objectContaining({
          scheduledStatus: 'PUBLISHED',
        }),
      });
      expect(mockPrismaService.story.update).toHaveBeenCalledWith({
        where: { id: 'story-1' },
        data: expect.objectContaining({
          scheduledStatus: 'PUBLISHED',
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('should catch errors gracefully', async () => {
      mockPrismaService.post.findMany.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.publishScheduledPosts()).resolves.not.toThrow();
    });
  });

  describe('purgeStaleDeviceSignals', () => {
    it('should purge device signals older than 180 days and log when count > 0', async () => {
      mockPrismaService.deviceSignal.deleteMany.mockResolvedValue({ count: 8 });

      await service.purgeStaleDeviceSignals();
      expect(mockPrismaService.deviceSignal.deleteMany).toHaveBeenCalledWith({
        where: {
          lastSeenAt: { lt: expect.any(Date) },
        },
      });
    });

    it('should handle count = 0', async () => {
      mockPrismaService.deviceSignal.deleteMany.mockResolvedValue({ count: 0 });
      await service.purgeStaleDeviceSignals();
      expect(mockPrismaService.deviceSignal.deleteMany).toHaveBeenCalled();
    });

    it('should catch errors gracefully', async () => {
      mockPrismaService.deviceSignal.deleteMany.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.purgeStaleDeviceSignals()).resolves.not.toThrow();
    });
  });
});
