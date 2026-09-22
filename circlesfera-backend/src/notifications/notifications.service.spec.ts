import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const mockPrismaService = {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    userSettings: {
      findFirst: vi.fn().mockResolvedValue({ pushNotifications: true }),
    },
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  const mockPushService = {
    sendNotification: vi.fn().mockResolvedValue(true),
    sendPushNotification: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: PushService, useValue: mockPushService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated user notifications', async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([
        { id: 'notif-1', recipientId: 'user-1', read: false },
      ]);
      mockPrismaService.notification.count.mockResolvedValue(1);

      const result = await service.findAll('user-1', { page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('markAsRead', () => {
    it('should return null if notification does not exist or recipient mismatch', async () => {
      mockPrismaService.notification.findFirst.mockResolvedValue(null);

      const result = await service.markAsRead('invalid-notif', 'user-1');
      expect(result).toBeNull();
    });

    it('should mark notification as read if it belongs to user', async () => {
      mockPrismaService.notification.findFirst.mockResolvedValue({
        id: 'notif-1',
        recipientId: 'user-1',
        read: false,
      });
      mockPrismaService.notification.update.mockResolvedValue({
        id: 'notif-1',
        read: true,
      });

      const result = await service.markAsRead('notif-1', 'user-1');
      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { read: true },
      });
      expect(result).toHaveProperty('read', true);
    });
  });

  describe('markAllAsRead', () => {
    it('should update all unread notifications for recipient', async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 5 });

      await service.markAllAsRead('user-1');
      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledWith({
        where: { recipientId: 'user-1', read: false },
        data: { read: true },
      });
    });
  });

  describe('getUnreadCount', () => {
    it('returns unread count for profile', async () => {
      mockPrismaService.notification.count.mockResolvedValueOnce(3);

      const result = await service.getUnreadCount('user-1');
      expect(result).toEqual({ count: 3 });
      expect(mockPrismaService.notification.count).toHaveBeenCalledWith({
        where: { recipientId: 'user-1', read: false },
      });
    });
  });

  describe('create and real-time event decoupling', () => {
    it('should emit notification.dispatched domain event instead of calling AppGateway directly', async () => {
      const createdNotification = {
        id: 'notif-100',
        recipientId: 'user-1',
        senderId: 'user-2',
        type: 'FOLLOW',
        content: 'started following you',
        postId: null,
      };

      mockPrismaService.notification.findFirst.mockResolvedValue(null);
      mockPrismaService.notification.create.mockResolvedValue(
        createdNotification,
      );

      await service.create({
        recipientId: 'user-1',
        senderId: 'user-2',
        type: 'FOLLOW' as any,
        content: 'started following you',
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.dispatched',
        {
          recipientId: 'user-1',
          notification: createdNotification,
        },
      );
    });

    it('aggregates unread LIKE notifications from multiple senders on same post', async () => {
      const existingUnread = {
        id: 'notif-like-1',
        recipientId: 'user-1',
        senderId: 'user-old',
        type: 'LIKE',
        postId: 'post-1',
        read: false,
      };

      mockPrismaService.notification.findFirst.mockResolvedValueOnce(
        existingUnread,
      );
      mockPrismaService.notification.update.mockResolvedValueOnce({
        ...existingUnread,
        senderId: 'user-new',
        content: 'A Alice y a otras personas les gustó tu publicación',
      });

      const res = await service.create({
        recipientId: 'user-1',
        senderId: 'user-new',
        type: 'LIKE' as any,
        content: 'Alice liked your post',
        postId: 'post-1',
      });

      expect(res).toBeDefined();
      expect(mockPrismaService.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-like-1' },
          data: expect.objectContaining({
            content: 'A Alice y a otras personas les gustó tu publicación',
          }),
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.dispatched',
        expect.anything(),
      );
    });

    it('aggregates unread COMMENT_LIKE notifications from multiple senders', async () => {
      const existingUnread = {
        id: 'notif-comment-like-1',
        recipientId: 'user-1',
        senderId: 'user-old',
        type: 'COMMENT_LIKE',
        postId: 'post-1',
        read: false,
      };

      mockPrismaService.notification.findFirst.mockResolvedValueOnce(
        existingUnread,
      );
      mockPrismaService.notification.update.mockResolvedValueOnce({
        ...existingUnread,
        senderId: 'user-new',
        content: 'A Bob y a otras personas les gustó tu comentario',
      });

      const res = await service.create({
        recipientId: 'user-1',
        senderId: 'user-new',
        type: 'COMMENT_LIKE' as any,
        content: 'Bob liked your comment',
        postId: 'post-1',
      });

      expect(res).toBeDefined();
      expect(mockPrismaService.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: 'A Bob y a otras personas les gustó tu comentario',
          }),
        }),
      );
    });

    it('returns existing unread notification without updating if same sender likes again', async () => {
      const existingUnread = {
        id: 'notif-same',
        recipientId: 'user-1',
        senderId: 'same-user',
        type: 'LIKE',
        postId: 'post-1',
        read: false,
      };

      mockPrismaService.notification.findFirst.mockResolvedValueOnce(
        existingUnread,
      );

      const res = await service.create({
        recipientId: 'user-1',
        senderId: 'same-user',
        type: 'LIKE' as any,
        content: 'Like',
        postId: 'post-1',
      });

      expect(res).toEqual(existingUnread);
      expect(mockPrismaService.notification.update).not.toHaveBeenCalled();
    });

    it('returns existing non-batchable notification if created within one minute', async () => {
      const existing = {
        id: 'notif-recent',
        recipientId: 'user-1',
        senderId: 'user-2',
        type: 'FOLLOW',
      };

      mockPrismaService.notification.findFirst.mockResolvedValueOnce(existing);

      const res = await service.create({
        recipientId: 'user-1',
        senderId: 'user-2',
        type: 'FOLLOW' as any,
        content: 'started following you',
      });

      expect(res).toEqual(existing);
      expect(mockPrismaService.notification.create).not.toHaveBeenCalled();
    });

    it('skips push notification when recipient disabled pushNotifications', async () => {
      mockPrismaService.notification.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.notification.create.mockResolvedValueOnce({
        id: 'n-no-push',
        recipientId: 'user-1',
        type: 'FOLLOW',
      });
      mockPrismaService.userSettings.findFirst.mockResolvedValueOnce({
        pushNotifications: false,
      });

      const res = await service.create({
        recipientId: 'user-1',
        senderId: 'user-2',
        type: 'FOLLOW' as any,
        content: 'followed you',
      });

      expect(res).toBeDefined();
      expect(mockPushService.sendNotification).not.toHaveBeenCalled();
    });

    it('handles error in push notification gracefully without throwing', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      mockPrismaService.notification.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.notification.create.mockResolvedValueOnce({
        id: 'n-push-err',
        recipientId: 'user-1',
        sender: { username: 'alice' },
        type: 'FOLLOW',
      });
      mockPrismaService.userSettings.findFirst.mockResolvedValueOnce({
        pushNotifications: true,
      });
      mockPushService.sendNotification.mockRejectedValueOnce(
        new Error('FCM unreachable'),
      );

      const res = await service.create({
        recipientId: 'user-1',
        senderId: 'user-2',
        type: 'FOLLOW' as any,
        content: 'followed you',
      });

      expect(res).toBeDefined();
      await new Promise((resolve) => setImmediate(resolve));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to send push notification',
        expect.any(Error),
      );
      consoleErrorSpy.mockRestore();
    });

    it('catches and logs top-level creation errors without throwing', async () => {
      mockPrismaService.notification.findFirst.mockRejectedValueOnce(
        new Error('DB failure'),
      );

      await expect(
        service.create({
          recipientId: 'user-1',
          senderId: 'user-2',
          type: 'FOLLOW' as any,
          content: 'test',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
