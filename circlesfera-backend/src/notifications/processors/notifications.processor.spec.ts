import { Test, type TestingModule } from '@nestjs/testing';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PushService } from '../../push/push.service.js';
import { NotificationsProcessor } from './notifications.processor.js';

describe('NotificationsProcessor', () => {
  let processor: NotificationsProcessor;

  const mockPrismaService = {
    notification: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  const mockPushService = {
    sendNotification: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsProcessor,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PushService, useValue: mockPushService },
      ],
    }).compile();

    processor = module.get<NotificationsProcessor>(NotificationsProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('routes send-digest-push job', async () => {
      const spy = vi
        .spyOn(processor, 'sendDigestPushNotifications')
        .mockResolvedValueOnce(undefined);

      await processor.process({ name: 'send-digest-push' } as any);
      expect(spy).toHaveBeenCalled();
    });

    it('routes cleanup-old-notifications job', async () => {
      const spy = vi
        .spyOn(processor, 'cleanupOldNotifications')
        .mockResolvedValueOnce({ readCount: 1, oldCount: 2 } as any);

      const res = await processor.process({
        name: 'cleanup-old-notifications',
      } as any);
      expect(spy).toHaveBeenCalled();
      expect(res).toEqual({ readCount: 1, oldCount: 2 });
    });

    it('throws UnrecoverableError on unknown job name', async () => {
      await expect(
        processor.process({ name: 'unknown-job' } as any),
      ).rejects.toThrow(UnrecoverableError);
    });
  });

  describe('sendDigestPushNotifications', () => {
    it('returns early when there are no recent unread notifications', async () => {
      mockPrismaService.notification.findMany.mockResolvedValueOnce([]);

      await processor.sendDigestPushNotifications();
      expect(mockPushService.sendNotification).not.toHaveBeenCalled();
    });

    it('groups notifications by recipient and sends single or plural push digests', async () => {
      mockPrismaService.notification.findMany.mockResolvedValueOnce([
        { id: 'n1', recipientId: 'user-single', type: 'LIKE' },
        { id: 'n2', recipientId: 'user-multi', type: 'LIKE' },
        { id: 'n3', recipientId: 'user-multi', type: 'COMMENT_LIKE' },
      ]);
      mockPushService.sendNotification
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Push failure'));

      await processor.sendDigestPushNotifications();

      expect(mockPushService.sendNotification).toHaveBeenCalledWith(
        'user-single',
        expect.objectContaining({
          body: 'Tienes 1 nueva notificación sobre tus publicaciones.',
        }),
      );
      expect(mockPushService.sendNotification).toHaveBeenCalledWith(
        'user-multi',
        expect.objectContaining({
          body: 'Tienes 2 nuevas interacciones en tus publicaciones.',
        }),
      );
    });
  });

  describe('cleanupOldNotifications', () => {
    it('deletes read and old notifications and returns counts', async () => {
      mockPrismaService.notification.deleteMany
        .mockResolvedValueOnce({ count: 5 })
        .mockResolvedValueOnce({ count: 2 });

      const res = await processor.cleanupOldNotifications();
      expect(res).toEqual({ readCount: 5, oldCount: 2 });
      expect(mockPrismaService.notification.deleteMany).toHaveBeenCalledTimes(
        2,
      );
    });

    it('rethrows when database deletion fails', async () => {
      mockPrismaService.notification.deleteMany.mockRejectedValueOnce(
        new Error('DB connection lost'),
      );

      await expect(processor.cleanupOldNotifications()).rejects.toThrow(
        'DB connection lost',
      );
    });
  });
});
