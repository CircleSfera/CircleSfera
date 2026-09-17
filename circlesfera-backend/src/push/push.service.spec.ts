import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from './push.service.js';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

describe('PushService', () => {
  let service: PushService;

  const mockPrismaService = {
    pushSubscription: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (
        key === 'VAPID_PUBLIC_KEY' ||
        key === 'VAPID_PRIVATE_KEY' ||
        key === 'VAPID_SUBJECT'
      ) {
        return null;
      }
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PushService>(PushService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('subscribe', () => {
    it('should upsert push subscription', async () => {
      const dto = {
        endpoint: 'https://push.example.com/sub-1',
        keys: {
          p256dh: 'key_p256dh',
          auth: 'key_auth',
        },
      };

      mockPrismaService.pushSubscription.upsert.mockResolvedValue({
        id: '1',
        userId: 'user-1',
        ...dto,
      });

      const result = await service.subscribe('user-1', dto);
      expect(mockPrismaService.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: dto.endpoint },
        create: {
          userId: 'user-1',
          endpoint: dto.endpoint,
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
        },
        update: {
          userId: 'user-1',
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
        },
      });
      expect(result).toHaveProperty('id');
    });
  });

  describe('unsubscribe', () => {
    it('should delete push subscription by endpoint', async () => {
      mockPrismaService.pushSubscription.deleteMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.unsubscribe(
        'https://push.example.com/sub-1',
      );
      expect(
        mockPrismaService.pushSubscription.deleteMany,
      ).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com/sub-1' },
      });
      expect(result).toEqual({ count: 1 });
    });
  });

  describe('sendNotification', () => {
    it('should return early if no subscriptions found for user', async () => {
      mockPrismaService.pushSubscription.findMany.mockResolvedValue([]);

      const result = await service.sendNotification('user-1', {
        title: 'Test Notification',
        body: 'Hello World',
      });

      expect(result).toBeUndefined();
    });

    it('should send notification to active subscriptions', async () => {
      mockPrismaService.pushSubscription.findMany.mockResolvedValue([
        {
          endpoint: 'https://push.example.com/sub-1',
          p256dh: 'p256',
          auth: 'auth_secret',
        },
      ]);
      vi.mocked(webpush.sendNotification).mockResolvedValueOnce({} as any);

      const result = await service.sendNotification('user-1', {
        title: 'New Post',
        body: 'User posted a new story',
      });

      expect(webpush.sendNotification).toHaveBeenCalledWith(
        {
          endpoint: 'https://push.example.com/sub-1',
          keys: { p256dh: 'p256', auth: 'auth_secret' },
        },
        JSON.stringify({
          title: 'New Post',
          body: 'User posted a new story',
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should remove expired subscription when webpush returns 404 or 410', async () => {
      mockPrismaService.pushSubscription.findMany.mockResolvedValue([
        {
          endpoint: 'https://push.example.com/expired-sub',
          p256dh: 'p256',
          auth: 'auth_secret',
        },
      ]);
      const error410 = Object.assign(new Error('Gone'), { statusCode: 410 });
      vi.mocked(webpush.sendNotification).mockRejectedValueOnce(error410);

      await service.sendNotification('user-1', {
        title: 'Expired Sub',
        body: 'Ping',
      });

      expect(
        mockPrismaService.pushSubscription.deleteMany,
      ).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com/expired-sub' },
      });
    });

    it('should log error on non-404/410 push failures', async () => {
      mockPrismaService.pushSubscription.findMany.mockResolvedValue([
        {
          endpoint: 'https://push.example.com/error-sub',
          p256dh: 'p256',
          auth: 'auth_secret',
        },
      ]);
      vi.mocked(webpush.sendNotification).mockRejectedValueOnce(
        new Error('Network failure'),
      );

      await service.sendNotification('user-1', {
        title: 'Failing Sub',
        body: 'Ping',
      });

      expect(
        mockPrismaService.pushSubscription.deleteMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe('VAPID initialization', () => {
    it('sets VAPID details when config keys are provided', async () => {
      const customConfig = {
        get: vi.fn((key: string) => {
          if (key === 'VAPID_PUBLIC_KEY') return 'pub-key';
          if (key === 'VAPID_PRIVATE_KEY') return 'priv-key';
          if (key === 'VAPID_SUBJECT') return 'mailto:admin@example.com';
          return null;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PushService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: ConfigService, useValue: customConfig },
        ],
      }).compile();

      const pushSvc = module.get<PushService>(PushService);
      expect(pushSvc).toBeDefined();
      expect(webpush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:admin@example.com',
        'pub-key',
        'priv-key',
      );
    });
  });
});
