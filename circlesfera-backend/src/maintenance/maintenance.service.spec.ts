import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskDataPort } from '../helpdesk/helpdesk-data.port.js';
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
    profileStrike: {
      deleteMany: vi.fn(),
    },
    notification: { deleteMany: vi.fn() },
    supportTicket: { deleteMany: vi.fn() },
    appeal: { deleteMany: vi.fn() },
    adminAuditLog: { deleteMany: vi.fn() },
    dataExportRequest: { deleteMany: vi.fn() },
    interactionEvent: {
      deleteMany: vi.fn(),
    },
    postView: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };

  const mockHelpdeskData = {
    deleteEndedBefore: vi.fn().mockResolvedValue({ count: 1 }),
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
        { provide: HelpdeskDataPort, useValue: mockHelpdeskData },
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

  describe('purgeExpiredRecords', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = new Date('2026-10-06T03:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      for (const model of [
        'notification',
        'appeal',
        'adminAuditLog',
        'dataExportRequest',
      ] as const) {
        mockPrismaService[model].deleteMany.mockResolvedValue({ count: 1 });
      }
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('applies each retention period', async () => {
      const twoYears = new Date(now.getTime() - 730 * DAY);

      await service.purgeExpiredRecords();

      expect(mockPrismaService.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          read: true,
          createdAt: { lt: new Date(now.getTime() - 90 * DAY) },
        },
      });
      // Tickets are the Help Desk's: it is asked to delete the ended ones.
      expect(mockHelpdeskData.deleteEndedBefore).toHaveBeenCalledWith(twoYears);
      expect(mockPrismaService.appeal.deleteMany).toHaveBeenCalledWith({
        where: {
          status: { in: ['APPROVED', 'REJECTED'] },
          OR: [
            { resolvedAt: { lt: twoYears } },
            { resolvedAt: null, updatedAt: { lt: twoYears } },
          ],
        },
      });
      expect(mockPrismaService.adminAuditLog.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: twoYears } },
      });
      expect(
        mockPrismaService.dataExportRequest.deleteMany,
      ).toHaveBeenCalledWith({
        where: {
          status: 'FAILED',
          createdAt: { lt: new Date(now.getTime() - 7 * DAY) },
        },
      });
    });

    it('never deletes unread notifications, open tickets or pending appeals', async () => {
      await service.purgeExpiredRecords();

      expect(
        mockPrismaService.notification.deleteMany.mock.calls[0][0].where.read,
      ).toBe(true);
      expect(mockPrismaService.supportTicket.deleteMany).not.toHaveBeenCalled();
      expect(
        mockPrismaService.appeal.deleteMany.mock.calls[0][0].where.status,
      ).toEqual({ in: ['APPROVED', 'REJECTED'] });
    });

    it('one failing job does not stop the others', async () => {
      mockPrismaService.notification.deleteMany.mockRejectedValueOnce(
        new Error('db'),
      );

      await service.purgeExpiredRecords();

      expect(mockPrismaService.adminAuditLog.deleteMany).toHaveBeenCalled();
      expect(mockPrismaService.dataExportRequest.deleteMany).toHaveBeenCalled();
    });
  });

  describe('erasePlaintextIps', () => {
    it('erases sign-up IPs older than 90 days and last IPs recorded over 90 days ago or never dated', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-10-06T03:00:00.000Z');
      vi.setSystemTime(now);
      const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      mockPrismaService.user.updateMany
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 3 });

      await service.erasePlaintextIps();

      expect(mockPrismaService.user.updateMany).toHaveBeenNthCalledWith(1, {
        where: { signupIp: { not: null }, createdAt: { lt: cutoff } },
        data: { signupIp: null },
      });
      expect(mockPrismaService.user.updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          lastIp: { not: null },
          OR: [{ lastIpAt: null }, { lastIpAt: { lt: cutoff } }],
        },
        data: { lastIp: null, lastIpAt: null },
      });
      vi.useRealTimers();
    });

    it('logs and continues when the update fails', async () => {
      mockPrismaService.user.updateMany.mockRejectedValueOnce(new Error('db'));
      await expect(service.erasePlaintextIps()).resolves.toBeUndefined();
    });
  });

  describe('purgeExpiredStrikeRecords', () => {
    it('deletes records expired over 12 months ago, keeping causes of restrictions in force', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-10-06T03:00:00.000Z');
      vi.setSystemTime(now);
      mockPrismaService.profile.findMany.mockResolvedValue([
        { banStrikeId: 's-ban', suspensionStrikeId: null },
        { banStrikeId: null, suspensionStrikeId: 's-susp' },
      ]);
      mockPrismaService.profileStrike.deleteMany.mockResolvedValue({
        count: 4,
      });

      await service.purgeExpiredStrikeRecords();

      expect(mockPrismaService.profileStrike.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          },
          id: { notIn: ['s-ban', 's-susp'] },
        },
      });
      vi.useRealTimers();
    });

    it('deletes without exclusions when no restriction has a strike cause', async () => {
      mockPrismaService.profile.findMany.mockResolvedValue([]);
      mockPrismaService.profileStrike.deleteMany.mockResolvedValue({
        count: 0,
      });

      await service.purgeExpiredStrikeRecords();

      expect(
        mockPrismaService.profileStrike.deleteMany.mock.calls[0][0].where,
      ).not.toHaveProperty('id');
    });

    it('logs and continues when the delete fails', async () => {
      mockPrismaService.profile.findMany.mockRejectedValueOnce(new Error('db'));
      await expect(
        service.purgeExpiredStrikeRecords(),
      ).resolves.toBeUndefined();
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

  describe('purgeOldInteractionEvents', () => {
    it('should purge interaction events older than 90 days and log when count > 0', async () => {
      mockPrismaService.interactionEvent.deleteMany.mockResolvedValue({
        count: 150,
      });

      await service.purgeOldInteractionEvents();
      expect(
        mockPrismaService.interactionEvent.deleteMany,
      ).toHaveBeenCalledWith({
        where: {
          createdAt: { lt: expect.any(Date) },
        },
      });
    });

    it('should handle count = 0', async () => {
      mockPrismaService.interactionEvent.deleteMany.mockResolvedValue({
        count: 0,
      });
      await service.purgeOldInteractionEvents();
      expect(mockPrismaService.interactionEvent.deleteMany).toHaveBeenCalled();
    });

    it('should catch errors gracefully', async () => {
      mockPrismaService.interactionEvent.deleteMany.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.purgeOldInteractionEvents()).resolves.not.toThrow();
    });
  });

  describe('purgeOldPostViews', () => {
    it('should purge post views older than 90 days and log when count > 0', async () => {
      mockPrismaService.postView.deleteMany.mockResolvedValue({ count: 75 });

      await service.purgeOldPostViews();
      expect(mockPrismaService.postView.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: { lt: expect.any(Date) },
        },
      });
    });

    it('should handle count = 0', async () => {
      mockPrismaService.postView.deleteMany.mockResolvedValue({ count: 0 });
      await service.purgeOldPostViews();
      expect(mockPrismaService.postView.deleteMany).toHaveBeenCalled();
    });

    it('should catch errors gracefully', async () => {
      mockPrismaService.postView.deleteMany.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.purgeOldPostViews()).resolves.not.toThrow();
    });
  });
});
