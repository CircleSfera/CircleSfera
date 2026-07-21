import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from './push.service.js';

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
      if (key === 'VAPID_PUBLIC_KEY' || key === 'VAPID_PRIVATE_KEY' || key === 'VAPID_SUBJECT') {
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
      mockPrismaService.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.unsubscribe('https://push.example.com/sub-1');
      expect(mockPrismaService.pushSubscription.deleteMany).toHaveBeenCalledWith({
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
  });
});
