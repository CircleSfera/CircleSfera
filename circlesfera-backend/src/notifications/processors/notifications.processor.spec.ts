import { Test, type TestingModule } from '@nestjs/testing';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PushService } from '../../push/push.service.js';
import { NotificationsService } from '../notifications.service.js';
import { NotificationsProcessor } from './notifications.processor.js';

describe('NotificationsProcessor', () => {
  let processor: NotificationsProcessor;

  const mockPrismaService = {
    notification: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    profile: { findMany: vi.fn().mockResolvedValue([]) },
    block: { findMany: vi.fn().mockResolvedValue([]) },
    foundingCreatorApplication: { findUnique: vi.fn() },
  };

  const mockPushService = {
    sendNotification: vi.fn(),
  };

  const mockNotifications = { create: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsProcessor,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PushService, useValue: mockPushService },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    processor = module.get<NotificationsProcessor>(NotificationsProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('the reminder that a free year ends (ids only in the job)', () => {
    const YEAR_END = new Date('2027-11-25T10:00:00.000Z');
    const job = {
      name: 'create-free-year-ending-notice',
      data: { applicationId: 'app_1', kind: 'free-year-ending-notice' },
    } as any;
    const year = (over: Record<string, unknown> = {}) => ({
      platformSubscription: {
        id: 'row_1',
        status: 'TRIALING',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: YEAR_END,
        periodPriceCents: null,
        profileId: 'prof_1',
        plan: { priceCents: 499, currency: 'EUR' },
        ...over,
      },
    });

    it.each([
      ['goes on', false, true],
      // Cancelled after the provider's notice came: the ending text.
      ['was set to end meanwhile', true, false],
    ])(
      'writes the notice of a year that %s from the year as it is now',
      async (_what, cancelAtPeriodEnd, continues) => {
        mockPrismaService.foundingCreatorApplication.findUnique.mockResolvedValue(
          year({ cancelAtPeriodEnd }),
        );
        mockNotifications.create.mockResolvedValue({ id: 'n_1' });

        await processor.process(job);

        expect(
          mockPrismaService.foundingCreatorApplication.findUnique,
        ).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'app_1' } }),
        );
        expect(mockNotifications.create).toHaveBeenCalledWith({
          recipientId: 'prof_1',
          type: 'SYSTEM',
          notice: {
            key: 'free_year_ending',
            endsAt: YEAR_END,
            priceCents: 499,
            currency: 'EUR',
            continues,
          },
          targetType: 'platform_subscription',
          targetId: 'row_1',
        });
      },
    );

    it.each([
      ['the application is gone', null],
      ['its year is gone', { platformSubscription: null }],
      ['its Profile is gone', year({ profileId: null })],
      ['the year is no longer free', year({ status: 'CANCELLED' })],
    ])('creates nothing when %s', async (_what, found) => {
      mockPrismaService.foundingCreatorApplication.findUnique.mockResolvedValue(
        found,
      );

      await expect(processor.process(job)).resolves.toBeUndefined();
      expect(mockNotifications.create).not.toHaveBeenCalled();
    });

    it('fails the job, to be tried again, when the notice could not be created', async () => {
      mockPrismaService.foundingCreatorApplication.findUnique.mockResolvedValue(
        year(),
      );
      mockNotifications.create.mockResolvedValue(undefined);

      await expect(processor.process(job)).rejects.toThrow(
        'The free year notice app_1 was not created',
      );
    });
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

    it('groups notifications by recipient and sends each digest in the account language', async () => {
      mockPrismaService.profile.findMany.mockResolvedValueOnce([
        { id: 'user-multi', user: { locale: 'en' } },
      ]);
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
        // No language on record: the default (Spanish).
        expect.objectContaining({
          title: 'Nueva actividad',
          body: 'Tienes 1 interacción nueva en tus publicaciones.',
        }),
        // The digest gathers likes: their switch decides.
        'likes',
      );
      expect(mockPushService.sendNotification).toHaveBeenCalledWith(
        'user-multi',
        expect.objectContaining({
          title: 'New activity',
          body: 'You have 2 new interactions on your posts.',
        }),
        'likes',
      );
    });
  });

  describe('a digest across a block', () => {
    it('leaves out likes from a Profile blocked either way, also blocked after the like', async () => {
      mockPrismaService.notification.findMany.mockResolvedValueOnce([
        { id: 'n1', recipientId: 'me', senderId: 'blocked', type: 'LIKE' },
        { id: 'n2', recipientId: 'me', senderId: 'blocker', type: 'LIKE' },
        { id: 'n3', recipientId: 'me', senderId: 'friend', type: 'LIKE' },
        { id: 'n4', recipientId: 'me', senderId: null, type: 'LIKE' },
      ]);
      mockPrismaService.block.findMany.mockResolvedValueOnce([
        { blockerId: 'me', blockedId: 'blocked' },
        { blockerId: 'blocker', blockedId: 'me' },
      ]);
      mockPushService.sendNotification.mockResolvedValueOnce(undefined);

      await processor.sendDigestPushNotifications();

      expect(mockPrismaService.block.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ blockerId: { in: ['me'] } }, { blockedId: { in: ['me'] } }],
        },
        select: { blockerId: true, blockedId: true },
      });
      expect(mockPushService.sendNotification).toHaveBeenCalledWith(
        'me',
        expect.objectContaining({
          body: 'Tienes 2 interacciones nuevas en tus publicaciones.',
        }),
        'likes',
      );
    });

    it('sends nothing when every like comes from a blocked Profile', async () => {
      mockPrismaService.notification.findMany.mockResolvedValueOnce([
        { id: 'n1', recipientId: 'me', senderId: 'blocked', type: 'LIKE' },
      ]);
      mockPrismaService.block.findMany.mockResolvedValueOnce([
        { blockerId: 'me', blockedId: 'blocked' },
      ]);

      await processor.sendDigestPushNotifications();

      expect(mockPushService.sendNotification).not.toHaveBeenCalled();
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
