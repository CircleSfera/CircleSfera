import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { AppGateway } from '../socket/app.gateway.js';
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
  };

  const mockAppGateway = {
    server: {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    },
  };

  const mockPushService = {
    sendPushNotification: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppGateway, useValue: mockAppGateway },
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

    it('should update notification status to read if owned by user', async () => {
      mockPrismaService.notification.findFirst.mockResolvedValue({
        id: 'notif-1',
        recipientId: 'user-1',
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
});
