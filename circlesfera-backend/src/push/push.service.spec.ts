import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApnsSender } from './apns.sender.js';
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
    profile: { findUnique: vi.fn() },
    nativePushToken: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const mockApns = { send: vi.fn().mockResolvedValue([]) };

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
        { provide: ApnsSender, useValue: mockApns },
      ],
    }).compile();

    service = module.get<PushService>(PushService);
    vi.clearAllMocks();
    mockPrismaService.nativePushToken.findMany.mockResolvedValue([]);
    mockApns.send.mockResolvedValue([]);
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
    it('takes off only a device of the person who asks', async () => {
      mockPrismaService.pushSubscription.deleteMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.unsubscribe(
        'user-1',
        'https://push.example.com/sub-1',
      );
      expect(
        mockPrismaService.pushSubscription.deleteMany,
      ).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com/sub-1', userId: 'user-1' },
      });
      expect(result).toEqual({ count: 1 });
    });
  });

  describe('sendNotification', () => {
    const device = (endpoint: string) => ({
      endpoint,
      p256dh: 'p256',
      auth: 'auth_secret',
    });

    beforeEach(() => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        userId: 'user-1',
        pushNotifications: true,
      });
    });

    it('reaches the devices of the person who owns the Profile', async () => {
      mockPrismaService.pushSubscription.findMany.mockResolvedValue([
        device('https://push.example.com/sub-1'),
      ]);
      vi.mocked(webpush.sendNotification).mockResolvedValueOnce({} as any);

      const result = await service.sendNotification(
        'profile-1',
        {
          title: 'New Post',
          body: 'User posted a new story',
        },
        null,
      );

      // The Profile names the person; devices are kept by person.
      expect(mockPrismaService.profile.findUnique).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        select: { userId: true, pushNotifications: true },
      });
      expect(mockPrismaService.pushSubscription.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
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

    it('sends nothing when the Profile has push off, or does not exist', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        userId: 'user-1',
        pushNotifications: false,
      });
      await service.sendNotification(
        'profile-1',
        { title: 't', body: 'b' },
        null,
      );
      mockPrismaService.profile.findUnique.mockResolvedValueOnce(null);
      await service.sendNotification(
        'missing',
        { title: 't', body: 'b' },
        null,
      );

      expect(
        mockPrismaService.pushSubscription.findMany,
      ).not.toHaveBeenCalled();
      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });

    it('sends nothing for a group the Profile switched off, and reads only that group', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        userId: 'user-1',
        pushNotifications: true,
        pushLikes: false,
      });

      await service.sendNotification(
        'profile-1',
        { title: 't', body: 'b' },
        'likes',
      );

      expect(mockPrismaService.profile.findUnique).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        select: { userId: true, pushNotifications: true, pushLikes: true },
      });
      expect(
        mockPrismaService.pushSubscription.findMany,
      ).not.toHaveBeenCalled();
    });

    it('sends a push of a group that is on', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        userId: 'user-1',
        pushNotifications: true,
        pushMessages: true,
      });
      mockPrismaService.pushSubscription.findMany.mockResolvedValue([
        device('https://push.example.com/sub-1'),
      ]);
      vi.mocked(webpush.sendNotification).mockResolvedValueOnce({} as any);

      await service.sendNotification(
        'profile-1',
        { title: 't', body: 'b' },
        'messages',
      );

      expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('a pause stops every push, also one with no group', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        userId: 'user-1',
        pushNotifications: false,
      });

      await service.sendNotification(
        'profile-1',
        { title: 'Moderation', body: 'b' },
        null,
      );

      expect(
        mockPrismaService.pushSubscription.findMany,
      ).not.toHaveBeenCalled();
    });

    it('returns early when the person has no device', async () => {
      mockPrismaService.pushSubscription.findMany.mockResolvedValue([]);

      const result = await service.sendNotification(
        'profile-1',
        {
          title: 'Test Notification',
          body: 'Hello World',
        },
        null,
      );

      expect(result).toBeUndefined();
    });

    it('removes a device the push service says is gone', async () => {
      mockPrismaService.pushSubscription.findMany.mockResolvedValue([
        device('https://push.example.com/expired-sub'),
      ]);
      const error410 = Object.assign(new Error('Gone'), { statusCode: 410 });
      vi.mocked(webpush.sendNotification).mockRejectedValueOnce(error410);

      await service.sendNotification(
        'profile-1',
        {
          title: 'Expired Sub',
          body: 'Ping',
        },
        null,
      );

      expect(
        mockPrismaService.pushSubscription.deleteMany,
      ).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com/expired-sub' },
      });
    });

    it('keeps a device after any other failure', async () => {
      mockPrismaService.pushSubscription.findMany.mockResolvedValue([
        device('https://push.example.com/error-sub'),
      ]);
      vi.mocked(webpush.sendNotification).mockRejectedValueOnce(
        new Error('Network failure'),
      );

      await service.sendNotification(
        'profile-1',
        {
          title: 'Failing Sub',
          body: 'Ping',
        },
        null,
      );

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
          { provide: ApnsSender, useValue: mockApns },
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
  describe('native apps', () => {
    it('keeps the token of a device for the person, also when it was someone else', async () => {
      await service.subscribeNative('user-2', {
        token: 'a1b2',
        platform: 'ios',
      });
      expect(mockPrismaService.nativePushToken.upsert).toHaveBeenCalledWith({
        where: { token: 'a1b2' },
        create: { userId: 'user-2', token: 'a1b2', platform: 'ios' },
        update: {
          userId: 'user-2',
          platform: 'ios',
          lastSeenAt: expect.any(Date),
        },
      });
    });

    it('takes off only a device of the person who asks', async () => {
      await service.unsubscribeNative('user-1', 'a1b2');
      expect(mockPrismaService.nativePushToken.deleteMany).toHaveBeenCalledWith(
        { where: { token: 'a1b2', userId: 'user-1' } },
      );
    });

    it('sends to the devices with data as strings, and deletes the ones gone', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        userId: 'user-1',
        pushNotifications: true,
      });
      mockPrismaService.pushSubscription.findMany.mockResolvedValue([]);
      mockPrismaService.nativePushToken.findMany.mockResolvedValue([
        { token: 'a1b2' },
        { token: 'c3d4' },
      ]);
      mockApns.send.mockResolvedValue(['c3d4']);

      await service.sendNotification(
        'profile-1',
        {
          title: 'Hi',
          body: 'New like',
          data: { url: '/p/1', count: 3, none: null },
        },
        null,
      );

      // Only iOS devices: the Android app has no push.
      expect(mockPrismaService.nativePushToken.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', platform: 'ios' },
        select: { token: true },
      });
      expect(mockApns.send).toHaveBeenCalledWith(['a1b2', 'c3d4'], {
        title: 'Hi',
        body: 'New like',
        data: { url: '/p/1', count: '3' },
      });
      expect(mockPrismaService.nativePushToken.deleteMany).toHaveBeenCalledWith(
        { where: { token: { in: ['c3d4'] } } },
      );
    });

    it('sends nothing to devices when the Profile has push off', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        userId: 'user-1',
        pushNotifications: false,
      });
      await service.sendNotification(
        'profile-1',
        { title: 'a', body: 'b' },
        null,
      );
      expect(mockApns.send).not.toHaveBeenCalled();
    });

    it('still sends web push when the native send fails', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        userId: 'user-1',
        pushNotifications: true,
      });
      mockPrismaService.nativePushToken.findMany.mockResolvedValue([
        { token: 'a1b2' },
      ]);
      mockApns.send.mockRejectedValue(new Error('apple down'));
      mockPrismaService.pushSubscription.findMany.mockResolvedValue([
        { endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' },
      ]);

      await service.sendNotification(
        'profile-1',
        { title: 'a', body: 'b' },
        null,
      );

      expect(webpush.sendNotification).toHaveBeenCalled();
    });
  });
});
