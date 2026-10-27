import { getQueueToken } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AccountType,
  ContentRating,
  SubscriptionStatus,
  VerificationLevel,
  Visibility,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CryptoService } from '../common/services/crypto.service.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { EmailService } from '../email/email.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import {
  ContentPreferenceDto,
  VisibilityDto,
} from './dto/update-settings.dto.js';
import { UsersService } from './users.service.js';

const mockUploadsService = {
  scheduleMediaDeletion: vi.fn().mockResolvedValue(undefined),
};

describe('UsersService', () => {
  const mockCacheManager = { del: vi.fn() };
  const mockEmailService = {
    underMinimumAgeMail: vi.fn().mockResolvedValue({
      to: 'child@example.com',
      subject: 'Deactivated',
      html: '<p>x</p>',
    }),
  };
  let service: UsersService;

  // What else the export reads about the person, empty unless a test fills it.
  const heldModels = {
    profileStrike: { findMany: vi.fn() },
    riskCase: { findMany: vi.fn() },
    searchHistory: { findMany: vi.fn() },
    interactionEvent: { findMany: vi.fn() },
    postView: { findMany: vi.fn() },
    storyView: { findMany: vi.fn() },
    supportTicket: { findMany: vi.fn() },
    platformSubscription: { findMany: vi.fn() },
    postUnlock: { findMany: vi.fn() },
    messageUnlock: { findMany: vi.fn() },
    storyUnlock: { findMany: vi.fn() },
    userExperiment: { findMany: vi.fn() },
    staffNote: { findMany: vi.fn() },
    pushSubscription: { findMany: vi.fn() },
    nativePushToken: { findMany: vi.fn() },
  };
  const mockCrypto = {
    decrypt: vi.fn((text: string) => text.replace(/^cipher_/, '')),
  };

  const mockPrismaService = {
    ...heldModels,
    $transaction: vi
      .fn()
      .mockImplementation((cb: any) => cb(mockPrismaService)),
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    adminAuditLog: { create: vi.fn() },
    profileMember: { updateMany: vi.fn() },
    profile: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    userSettings: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    refreshToken: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    follow: {
      findMany: vi.fn(),
    },
    block: {
      findMany: vi.fn(),
    },
  };

  const mockStripeService = {
    createIdentityVerificationSession: vi.fn(),
    getIdentityVerificationSession: vi.fn(),
  };

  const mockUsersQueue = {
    add: vi.fn(),
    getJob: vi.fn(),
  };

  const mockOutboxService = {
    enqueue: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
    triggerImmediatePublish: vi.fn(),
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((cb: any) =>
      cb(mockPrismaService),
    );
    for (const model of Object.values(heldModels)) {
      model.findMany.mockResolvedValue([]);
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StripeService, useValue: mockStripeService },
        { provide: OutboxService, useValue: mockOutboxService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: CryptoService, useValue: mockCrypto },
        { provide: EmailService, useValue: mockEmailService },
        { provide: UploadsService, useValue: mockUploadsService },
        {
          provide: getQueueToken('users-processing'),
          useValue: mockUsersQueue,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSuggestions', () => {
    it('should return user suggestions excluding follows and blocks', async () => {
      const mockSuggestions = [
        {
          id: 'p1',
          username: 'user_s1',
          fullName: 'User S1',
          avatar: null,
          bio: null,
          user: { id: 's1', verificationLevel: 'BASIC' },
          _count: { followers: 10 },
        },
      ];
      mockPrismaService.profile.findMany
        .mockResolvedValueOnce([{ id: 'my-profile' }])
        .mockResolvedValueOnce(mockSuggestions);

      const limit = 10;
      const result = await service.getSuggestions('1', limit);
      expect(result).toHaveLength(1);
      expect(result[0].profileId).toBe('p1');
      expect(result[0].username).toBe('user_s1');

      const suggestionCall = vi.mocked(mockPrismaService.profile.findMany).mock
        .calls[1][0] as any;
      expect(suggestionCall.where.userId).toEqual({ not: '1' });
      expect(suggestionCall.where.followers.none.followerId).toEqual({
        in: ['my-profile'],
      });
      expect(suggestionCall.take).toBe(limit);
    });
  });

  describe('banUser and unbanUser', () => {
    it('should ban a user', async () => {
      mockPrismaService.user.update.mockResolvedValue({
        id: '1',
        isActive: false,
        isRootBanned: true,
      });
      const result = await service.banUser('1');
      expect(result.isActive).toBe(false);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isActive: false, isRootBanned: true },
      });
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: '1' },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'user.session.terminate',
        {
          userId: '1',
          reason: 'Account banned by administration',
        },
      );
    });

    it('should unban a user', async () => {
      mockPrismaService.profile.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.user.update.mockResolvedValue({
        id: '1',
        isActive: true,
        isRootBanned: false,
      });
      const result = await service.unbanUser('1');
      expect(mockPrismaService.profile.updateMany).toHaveBeenCalledWith({
        where: { userId: '1' },
        data: { suspendedUntil: null, isAccountBanned: false },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isActive: true, isRootBanned: false },
      });
      expect(result.isActive).toBe(true);
    });
  });

  describe('exportUserData', () => {
    it('throws error when user account or relations are not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.exportUserData('missing-user')).rejects.toThrow(
        'User not found',
      );
    });

    it('returns formatted GDPR safe data export', async () => {
      const mockAccount = {
        id: 'u_exp',
        email: 'exp@test.com',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        isActive: true,
        role: 'USER',
        dateOfBirth: new Date('1995-05-10'),
        identityVerifiedAt: new Date('2026-01-03'),
        emailVerified: true,
        signupCountry: 'ES',
        signupIp: '1.2.3.4',
        lastIp: '1.2.3.5',
        botLabeledAt: null,
        deviceSignals: [{ firstSeenAt: new Date(), lastSeenAt: new Date() }],
        signIns: [
          {
            email: 'exp@test.com',
            emailVerified: new Date('2026-01-01'),
            isTwoFactorEnabled: true,
            createdAt: new Date('2026-01-01'),
            profiles: [{ username: 'exporter' }],
            // Never part of the export, whatever the row carries.
            password: 'hash',
            twoFactorSecret: 'secret',
            resetToken: 'token',
          },
          {
            email: 'shop@test.com',
            emailVerified: null,
            isTwoFactorEnabled: false,
            createdAt: new Date('2026-02-01'),
            profiles: [{ username: 'exporter.shop' }],
          },
        ],
      };

      const mockRelations = {
        profiles: [
          {
            id: 'prof_exp',
            username: 'exporter',
            posts: [
              { id: 'post_1', media: [], _count: { likes: 5, comments: 2 } },
            ],
            stories: [
              {
                id: 'st_1',
                url: 'https://cdn/st.jpg',
                mediaType: 'IMAGE',
                createdAt: new Date(),
                expiresAt: new Date(),
                isCloseFriendsOnly: false,
              },
            ],
            likes: [{ id: 'like_1', postId: 'post_1', createdAt: new Date() }],
            notifications: [],
            collections: [],
            followers: [{ follower: { username: 'fan1' } }],
            following: [{ following: { username: 'star1' } }],
            comments: [],
            bookmarks: [],
            messages: [
              { id: 'msg_1', content: 'cipher_hello', conversationId: 'c1' },
            ],
            reports: [],
          },
        ],
        settings: { privacyLevel: 'PUBLIC' },
        appeals: [],
        sentTransactions: [
          {
            id: 'tx_s1',
            type: 'TIP',
            amount: 500,
            currency: 'EUR',
            status: 'COMPLETED',
            createdAt: new Date(),
            receiverId: 'u_rec',
          },
        ],
        receivedTransactions: [
          {
            id: 'tx_r1',
            type: 'TIP',
            amount: 500,
            currency: 'EUR',
            status: 'COMPLETED',
            createdAt: new Date(),
            senderId: 'u_send',
          },
        ],
      };

      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(mockAccount)
        .mockResolvedValueOnce(mockRelations);

      (mockAccount as Record<string, unknown>).profileActivities = [
        {
          action: 'POST_PUBLISHED',
          targetId: 'post-9',
          createdAt: new Date('2026-10-01'),
          profile: { username: 'shop' },
        },
      ];
      const res = await service.exportUserData('u_exp');
      // What the person did on Business Profiles, as a member or owner.
      expect(res.teamActivity).toEqual([
        {
          action: 'POST_PUBLISHED',
          on: 'shop',
          targetId: 'post-9',
          at: new Date('2026-10-01'),
        },
      ]);
      // Every way the person signs in, and nothing secret about any.
      expect(res.signIns).toEqual([
        {
          email: 'exp@test.com',
          emailVerified: new Date('2026-01-01'),
          twoFactorEnabled: true,
          createdAt: new Date('2026-01-01'),
          profiles: ['exporter'],
        },
        {
          email: 'shop@test.com',
          emailVerified: null,
          twoFactorEnabled: false,
          createdAt: new Date('2026-02-01'),
          profiles: ['exporter.shop'],
        },
      ]);
      expect(JSON.stringify(res.signIns)).not.toMatch(
        /password|twoFactorSecret|resetToken|hash/,
      );

      expect(res.id).toBe('u_exp');
      expect(res.email).toBe('exp@test.com');
      expect(res.network).toEqual(
        expect.objectContaining({ signupIp: '1.2.3.4', signupCountry: 'ES' }),
      );
      expect((res.devices as any).count).toBe(1);
      // The person receives what they wrote, not the stored ciphertext.
      expect((res.profiles as any[])[0].messages).toEqual([
        { id: 'msg_1', content: 'hello', conversationId: 'c1' },
      ]);
      // The IP retention in force.
      expect((res.network as any).note).toContain('90 days');
      expect(JSON.stringify(res)).not.toContain('life of the account');
      expect(res.sentTransactions).toHaveLength(1);
      expect(res.receivedTransactions).toHaveLength(1);
    });

    it('holds everything else kept about the person, staff notes included, and never who on the staff acted', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({
          id: 'u_exp',
          deviceSignals: [],
          signIns: [],
        })
        .mockResolvedValueOnce({
          profiles: [],
          settings: null,
          appeals: [],
          sentTransactions: [],
          receivedTransactions: [],
        });
      heldModels.profileStrike.findMany.mockResolvedValue([
        { kind: 'STRIKE', reason: 'SPAM' },
      ]);
      heldModels.riskCase.findMany.mockResolvedValue([{ score: 80 }]);
      heldModels.searchHistory.findMany.mockResolvedValue([{ query: 'cats' }]);
      heldModels.interactionEvent.findMany.mockResolvedValue([
        { eventType: 'VIEW' },
      ]);
      heldModels.postView.findMany.mockResolvedValue([{ postId: 'p1' }]);
      heldModels.storyView.findMany.mockResolvedValue([{ storyId: 's1' }]);
      heldModels.supportTicket.findMany.mockResolvedValue([
        { reference: 7, messages: [{ visibility: 'INTERNAL', body: 'n' }] },
      ]);
      heldModels.platformSubscription.findMany.mockResolvedValue([
        { status: 'ACTIVE', plan: { name: 'Pro' } },
      ]);
      heldModels.postUnlock.findMany.mockResolvedValue([{ postId: 'p2' }]);
      heldModels.messageUnlock.findMany.mockResolvedValue([
        { messageId: 'm1' },
      ]);
      heldModels.storyUnlock.findMany.mockResolvedValue([{ storyId: 's2' }]);
      heldModels.userExperiment.findMany.mockResolvedValue([
        { experimentKey: 'feed', variant: 'b' },
      ]);
      heldModels.staffNote.findMany.mockResolvedValue([
        { body: 'Asked twice about a refund', createdAt: new Date() },
      ]);
      heldModels.pushSubscription.findMany.mockResolvedValue([
        { createdAt: new Date() },
      ]);
      heldModels.nativePushToken.findMany.mockResolvedValue([
        { platform: 'ios', createdAt: new Date(), lastSeenAt: new Date() },
      ]);

      const res = (await service.exportUserData('u_exp')) as any;

      expect(res.warningsAndStrikes).toHaveLength(1);
      expect(res.spamReviewCases[0].score).toBe(80);
      expect(res.searchHistory[0].query).toBe('cats');
      expect(res.activity.interactions).toHaveLength(1);
      expect(res.activity.postViews).toHaveLength(1);
      expect(res.activity.storyViews).toHaveLength(1);
      expect(res.supportRequests[0].reference).toBe(7);
      expect(res.platformPlans[0].plan.name).toBe('Pro');
      expect(res.unlocks.posts).toHaveLength(1);
      expect(res.unlocks.messages).toHaveLength(1);
      expect(res.unlocks.stories).toHaveLength(1);
      expect(res.experiments[0].variant).toBe('b');
      expect(res.staffNotes[0].body).toBe('Asked twice about a refund');
      expect(res.pushDevices.browsers).toHaveLength(1);
      expect(res.pushDevices.apps[0].platform).toBe('ios');
      // Never the keys or tokens of a device.
      expect(heldModels.nativePushToken.findMany).toHaveBeenCalledWith({
        where: { userId: 'u_exp' },
        select: { platform: true, createdAt: true, lastSeenAt: true },
      });
      expect(heldModels.pushSubscription.findMany).toHaveBeenCalledWith({
        where: { userId: 'u_exp' },
        select: { createdAt: true },
      });

      // Read by the account's id or its Profiles; staff who acted are not
      // selected.
      expect(heldModels.staffNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u_exp' },
          select: { body: true, createdAt: true },
        }),
      );
      expect(heldModels.profileStrike.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { profile: { userId: 'u_exp' } } }),
      );
      for (const model of [
        heldModels.profileStrike,
        heldModels.riskCase,
        heldModels.staffNote,
      ]) {
        const { select } = model.findMany.mock.calls[0][0];
        expect(select).not.toHaveProperty('adminId');
        expect(select).not.toHaveProperty('reviewedById');
        expect(select).not.toHaveProperty('authorId');
      }
    });
  });

  describe('deleteScheduledUser', () => {
    const storedFile = { findMany: vi.fn() };
    const participant = {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    };
    const conversation = { findUnique: vi.fn() };
    const message = { create: vi.fn() };
    beforeEach(() => {
      message.create.mockImplementation(
        ({ data }: { data: { conversationId: string; senderId: string } }) =>
          Promise.resolve({ id: 'notice-1', ...data }),
      );
      (mockPrismaService as Record<string, unknown>).message = message;
      storedFile.findMany.mockResolvedValue([
        { key: '/uploads/own-1.jpg' },
        { key: '/uploads/own-2.mp4' },
      ]);
      participant.findMany.mockResolvedValue([]);
      (mockPrismaService as Record<string, unknown>).storedFile = storedFile;
      (mockPrismaService as Record<string, unknown>).participant = participant;
      (mockPrismaService as Record<string, unknown>).conversation =
        conversation;
    });

    it('names a new admin for each group the account administered, in the same transaction', async () => {
      participant.findMany.mockResolvedValueOnce([
        { conversationId: 'group-1' },
      ]);
      conversation.findUnique.mockResolvedValueOnce({ isGroup: true });
      participant.count.mockResolvedValueOnce(0);
      participant.findFirst.mockResolvedValueOnce({
        id: 'part-oldest',
        profileId: 'p-oldest',
      });
      participant.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrismaService.user.deleteMany.mockResolvedValue({ count: 1 });
      // Everyone left in the group, read once the erasure commits.
      participant.findMany.mockResolvedValueOnce([{ profileId: 'p-oldest' }]);

      await expect(service.deleteScheduledUser('u_admin')).resolves.toBe(true);

      expect(participant.findMany).toHaveBeenCalledWith({
        where: {
          isAdmin: true,
          profile: { userId: 'u_admin' },
          conversation: { isGroup: true },
        },
        select: { conversationId: true },
      });
      // Read before the cascade removes the account's participation.
      expect(participant.findMany.mock.invocationCallOrder[0]).toBeLessThan(
        mockPrismaService.user.deleteMany.mock.invocationCallOrder[0],
      );
      expect(participant.updateMany).toHaveBeenCalledWith({
        where: { id: 'part-oldest', deletedAt: null, isAdmin: false },
        data: { isAdmin: true },
      });
      // The group is told who its new admin is.
      expect(message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            conversationId: 'group-1',
            senderId: 'p-oldest',
            content: '',
            kind: 'ADMIN_GRANTED',
          },
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('chat.message.sent', {
        participants: [{ profileId: 'p-oldest' }],
        payload: expect.objectContaining({
          conversationId: 'group-1',
          senderId: 'p-oldest',
          kind: 'ADMIN_GRANTED',
        }),
      });
    });

    it('tells no group anything when the account was restored meanwhile', async () => {
      participant.findMany.mockResolvedValueOnce([
        { conversationId: 'group-1' },
      ]);
      mockPrismaService.user.deleteMany.mockResolvedValue({ count: 0 });
      mockEventEmitter.emit.mockClear();

      await expect(service.deleteScheduledUser('u_back')).resolves.toBe(false);

      expect(message.create).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
        'chat.message.sent',
        expect.anything(),
      );
    });

    it('deletes the account and queues every file its Profiles uploaded, in one transaction', async () => {
      mockPrismaService.user.deleteMany.mockResolvedValue({ count: 1 });
      const res = await service.deleteScheduledUser('u_sched');
      expect(res).toBe(true);
      expect(mockPrismaService.user.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'u_sched',
          isActive: false,
          OR: [
            { scheduledDeletionAt: { not: null } },
            { deletedAt: { not: null } },
          ],
        },
      });
      // From the record of its own files, not the addresses its rows name.
      expect(storedFile.findMany).toHaveBeenCalledWith({
        where: { profile: { userId: 'u_sched' } },
        select: { key: true },
      });
      expect(mockUploadsService.scheduleMediaDeletion).toHaveBeenCalledWith(
        ['/uploads/own-1.jpg', '/uploads/own-2.mp4'],
        { tx: mockPrismaService },
      );
    });

    it('queues the files of a large account in batches of five hundred', async () => {
      storedFile.findMany.mockResolvedValueOnce(
        Array.from({ length: 1201 }, (_, i) => ({ key: `/uploads/${i}.jpg` })),
      );
      mockPrismaService.user.deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteScheduledUser('u_big');

      const batches = mockUploadsService.scheduleMediaDeletion.mock.calls.map(
        ([keys]) => keys.length,
      );
      expect(batches).toEqual([500, 500, 201]);
    });

    it('queues no file when the account was restored meanwhile', async () => {
      mockPrismaService.user.deleteMany.mockResolvedValue({ count: 0 });
      const res = await service.deleteScheduledUser('u_restored');
      expect(res).toBe(false);
      expect(mockUploadsService.scheduleMediaDeletion).not.toHaveBeenCalled();
    });
  });

  describe('scheduleDeletion and cancelScheduledDeletion', () => {
    it('scheduleDeletion atomically enqueues job and updates user', async () => {
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.scheduleDeletion('user-abc');

      expect(result).toBeInstanceOf(Date);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-abc' },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-abc' },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'user.session.terminate',
        expect.objectContaining({ userId: 'user-abc' }),
      );
      expect(mockOutboxService.enqueue).toHaveBeenCalled();
      expect(mockOutboxService.triggerImmediatePublish).toHaveBeenCalled();
    });

    it('eraseNow queues the hard delete at once, with its own job id, through the same transaction', async () => {
      mockPrismaService.user.update.mockResolvedValue({});

      const at = await service.eraseNow('user-now');

      expect(at).toBeInstanceOf(Date);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-now' },
        data: {
          isActive: false,
          deletedAt: expect.any(Date),
          scheduledDeletionAt: at,
        },
      });
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-now' },
      });
      // Not delete-<id>: a deletion the person scheduled earlier, still
      // delayed under that id, must not hold this one back.
      expect(mockOutboxService.enqueue).toHaveBeenCalledWith(
        mockPrismaService,
        expect.objectContaining({
          queueName: 'users-processing',
          eventName: 'hard-delete-user',
          payload: { userId: 'user-now' },
          options: expect.objectContaining({
            delay: 0,
            jobId: 'delete-now-user-now',
          }),
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'user.session.terminate',
        { userId: 'user-now', reason: 'Account deleted by staff' },
      );
    });

    it('cancelScheduledDeletion throws error when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(
        service.cancelScheduledDeletion('missing-cancel'),
      ).rejects.toThrow('User not found');
    });

    it('cancelScheduledDeletion throws error when no scheduled deletion exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u_no_sched',
        scheduledDeletionAt: null,
      });
      await expect(
        service.cancelScheduledDeletion('u_no_sched'),
      ).rejects.toThrow('No scheduled deletion to cancel');
    });

    it('cancelScheduledDeletion throws error when grace window has expired', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u_expired',
        scheduledDeletionAt: new Date(Date.now() - 10000),
      });
      await expect(
        service.cancelScheduledDeletion('u_expired'),
      ).rejects.toThrow('Deletion grace window has expired');
    });

    it('cancelScheduledDeletion successfully restores user and removes job', async () => {
      const futureDate = new Date(Date.now() + 1000000);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u_restore',
        scheduledDeletionAt: futureDate,
      });
      mockPrismaService.user.update.mockResolvedValue({});
      const mockJob = { remove: vi.fn().mockResolvedValue(undefined) };
      mockUsersQueue.getJob.mockResolvedValue(mockJob);

      const res = await service.cancelScheduledDeletion('u_restore');

      expect(res).toEqual({
        success: true,
        message: 'Account restoration scheduled deletion cancelled',
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u_restore' },
        data: {
          isActive: true,
          deletedAt: null,
          scheduledDeletionAt: null,
        },
      });
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('cancelScheduledDeletion handles job removal error gracefully', async () => {
      const futureDate = new Date(Date.now() + 1000000);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u_restore_job_err',
        scheduledDeletionAt: futureDate,
      });
      mockPrismaService.user.update.mockResolvedValue({});
      mockUsersQueue.getJob.mockRejectedValue(
        new Error('Job not found in queue'),
      );

      const res = await service.cancelScheduledDeletion('u_restore_job_err');
      expect(res.success).toBe(true);
    });
  });

  describe('updateLocale', () => {
    it('stores the language and returns only it', async () => {
      mockPrismaService.user.update.mockResolvedValue({ locale: 'en' });

      await expect(service.updateLocale('u_loc', 'en')).resolves.toEqual({
        locale: 'en',
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u_loc' },
        data: { locale: 'en' },
        select: { locale: true },
      });
    });
  });

  describe('getSettings and updateSettings', () => {
    const tx = {
      userSettings: { upsert: vi.fn() },
      profile: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      follow: { updateMany: vi.fn() },
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mockPrismaService.userSettings.findUnique.mockResolvedValue({
        userId: 'u-1',
        // What the person's row still holds is never what is answered.
        privacyLevel: 'PUBLIC',
        pushNotifications: true,
        emailNotifications: false,
      });
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: 'p-1',
        privacyLevel: 'PRIVATE',
        pushNotifications: false,
        pushLikes: false,
        pushComments: true,
        pushFollows: true,
        pushMessages: false,
        pushLive: true,
      });
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (client: typeof tx) => unknown) => fn(tx),
      );
      tx.profile.findUnique.mockResolvedValue({ privacyLevel: 'PRIVATE' });
      tx.follow.updateMany.mockResolvedValue({ count: 2 });
    });

    it('answers the private choice and the push switch of the Profile the session acts as', async () => {
      const res = await service.getSettings('u-1', 'p-1');

      expect(mockPrismaService.profile.findFirst).toHaveBeenCalledWith({
        where: { id: 'p-1', userId: 'u-1' },
        select: {
          privacyLevel: true,
          saveStoriesToArchive: true,
          pushNotifications: true,
          pushLikes: true,
          pushComments: true,
          pushFollows: true,
          pushMessages: true,
          pushLive: true,
        },
      });
      expect(res.privacyLevel).toBe('PRIVATE');
      expect(res).toMatchObject({
        pushNotifications: false,
        pushLikes: false,
        pushComments: true,
        pushFollows: true,
        pushMessages: false,
        pushLive: true,
      });
      // The email switch stays with the person.
      expect(res.emailNotifications).toBe(false);
      expect(mockPrismaService.userSettings.create).not.toHaveBeenCalled();
    });

    it('creates the settings of a person who has none', async () => {
      mockPrismaService.userSettings.findUnique.mockResolvedValue(null);
      mockPrismaService.userSettings.create.mockResolvedValue({
        userId: 'u-new',
      });

      const res = await service.getSettings('u-new', 'p-1');

      expect(mockPrismaService.userSettings.create).toHaveBeenCalledWith({
        data: { userId: 'u-new' },
      });
      expect(res.userId).toBe('u-new');
    });

    it("saves what is the person's on the person and what is the Profile's on the Profile", async () => {
      await service.updateSettings('u-1', 'p-1', {
        privacyLevel: VisibilityDto.PUBLIC,
        contentPreference: ContentPreferenceDto.MATURE,
        blurSensitiveContent: false,
        emailNotifications: false,
        newsletter: false,
        pushNotifications: true,
        pushLive: false,
        isOnboarded: true,
        country: 'ES',
      });

      expect(tx.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId: 'u-1' },
        update: {
          contentPreference: ContentRating.MATURE,
          blurSensitiveContent: false,
          emailNotifications: false,
          newsletter: false,
          country: 'ES',
          isOnboarded: true,
        },
        create: {
          userId: 'u-1',
          contentPreference: ContentRating.MATURE,
          blurSensitiveContent: false,
          emailNotifications: false,
          newsletter: false,
          country: 'ES',
          isOnboarded: true,
        },
      });
      expect(tx.profile.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        // Only the switches sent change.
        data: { pushNotifications: true, pushLive: false },
      });
      expect(tx.profile.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { privacyLevel: Visibility.PUBLIC },
      });
      // The Profile was private: the requests that waited are accepted.
      expect(tx.follow.updateMany).toHaveBeenCalledWith({
        where: { followingId: 'p-1', status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
    });

    it('leaves the Profile alone when neither of its two settings is sent', async () => {
      await service.updateSettings('u-1', 'p-1', {} as any);

      expect(tx.userSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            contentPreference: ContentRating.GENERAL,
            blurSensitiveContent: true,
            emailNotifications: true,
            isOnboarded: false,
          }),
        }),
      );
      expect(tx.profile.update).not.toHaveBeenCalled();
      expect(tx.follow.updateMany).not.toHaveBeenCalled();
    });

    it('keeps when stories stopped being saved, the first time it is turned off', async () => {
      const now = new Date('2026-11-23T10:00:00.000Z');
      vi.useFakeTimers({ now, toFake: ['Date'] });
      try {
        await service.updateSettings('u-1', 'p-1', {
          saveStoriesToArchive: false,
        });
      } finally {
        vi.useRealTimers();
      }

      // Only a Profile that still saves them changes: turning it off again
      // keeps the first time, so what ended in between stays kept.
      expect(tx.profile.updateMany).toHaveBeenCalledWith({
        where: { id: 'p-1', saveStoriesToArchive: true },
        data: { saveStoriesToArchive: false, storyArchiveOffAt: now },
      });
      expect(tx.profile.update).not.toHaveBeenCalled();
    });

    it('saves stories again, and forgets when it was off', async () => {
      await service.updateSettings('u-1', 'p-1', {
        saveStoriesToArchive: true,
      });

      expect(tx.profile.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { saveStoriesToArchive: true, storyArchiveOffAt: null },
      });
      expect(tx.profile.updateMany).not.toHaveBeenCalled();
    });

    it('answers whether stories are saved, on unless the Profile turned it off', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        privacyLevel: 'PUBLIC',
        saveStoriesToArchive: false,
      });
      await expect(service.getSettings('u-1', 'p-1')).resolves.toMatchObject({
        saveStoriesToArchive: false,
      });

      mockPrismaService.profile.findFirst.mockResolvedValueOnce(null);
      await expect(service.getSettings('u-1', 'p-1')).resolves.toMatchObject({
        saveStoriesToArchive: true,
      });
    });

    it("refuses the settings of a Profile that is not the person's", async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue(null);

      await expect(
        service.updateSettings('u-1', 'p-of-someone-else', {
          privacyLevel: VisibilityDto.PUBLIC,
        }),
      ).rejects.toThrow('Profile not found');

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('createIdentitySession', () => {
    it('creates identity session and saves session ID on user', async () => {
      mockStripeService.createIdentityVerificationSession.mockResolvedValue({
        id: 'vs_123',
        url: 'https://verify.stripe.com/vs_123',
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const res = await service.createIdentitySession(
        'u_kyc',
        'https://app.com/return',
      );

      expect(
        mockStripeService.createIdentityVerificationSession,
      ).toHaveBeenCalledWith('u_kyc', 'https://app.com/return');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u_kyc' },
        data: { stripeIdentitySessionId: 'vs_123' },
      });
      expect(res).toEqual({ url: 'https://verify.stripe.com/vs_123' });
    });

    it('falls back to returnUrl when session url is null', async () => {
      mockStripeService.createIdentityVerificationSession.mockResolvedValue({
        id: 'vs_no_url',
        url: null,
      });

      const res = await service.createIdentitySession(
        'u_kyc2',
        'https://app.com/fallback',
      );
      expect(res.url).toBe('https://app.com/fallback');
    });
  });

  describe('handleIdentityWebhook and resolveIdentityUserId', () => {
    it('warns and exits early if user cannot be resolved from session', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await service.handleIdentityWebhook({
        id: 'vs_unknown',
        status: 'verified',
      } as any);

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('returns null when session.id is empty and metadata.userId is absent', async () => {
      await service.handleIdentityWebhook({
        id: '',
        metadata: {},
        status: 'verified',
      } as any);

      expect(mockPrismaService.user.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('accurately decrements age when birthday has not occurred yet this calendar year', async () => {
      const birthYear = new Date().getFullYear() - 17;
      await service.handleIdentityWebhook({
        id: 'vs_birthday_later',
        status: 'verified',
        metadata: { userId: 'u_later' },
        verified_outputs: {
          dob: { year: birthYear, month: 12, day: 31 },
        },
      } as any);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u_later' },
          data: expect.objectContaining({
            identityVerifiedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('resolves user from session.id lookup in database when metadata is missing', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'u_db_resolved',
      });

      await service.handleIdentityWebhook({
        id: 'vs_lookup',
        status: 'verified',
      } as any);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u_db_resolved' },
          data: expect.objectContaining({
            identityVerifiedAt: expect.any(Date),
          }),
        }),
      );
    });

    describe('an identity check that shows an age under 16', () => {
      const under16 = () =>
        service.handleIdentityWebhook({
          id: 'vs_under16',
          status: 'verified',
          metadata: { userId: 'u_child' },
          verified_outputs: {
            dob: { year: new Date().getFullYear() - 14, month: 1, day: 1 },
          },
        } as any);

      beforeEach(() => {
        mockPrismaService.user.findUnique.mockResolvedValue({
          email: 'child@example.com',
          profiles: [{ fullName: 'Kid' }],
        });
      });

      it('deactivates the account, records it for staff and tells the person how to ask for a review', async () => {
        mockPrismaService.user.updateMany.mockResolvedValue({ count: 1 });

        await under16();

        expect(mockPrismaService.user.updateMany).toHaveBeenCalledWith({
          where: { id: 'u_child', isActive: true },
          data: { isActive: false },
        });
        expect(mockPrismaService.adminAuditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            targetType: 'user',
            targetId: 'u_child',
            details: expect.stringContaining('automatically'),
          }),
        });
        expect(mockEmailService.underMinimumAgeMail).toHaveBeenCalledWith(
          'child@example.com',
          'Kid',
        );
        // The email is kept with the deactivation, sent from the outbox.
        expect(mockOutboxService.enqueue).toHaveBeenCalledWith(
          mockPrismaService,
          expect.objectContaining({
            queueName: 'email-processing',
            eventName: 'send-transactional-email',
            payload: expect.objectContaining({ to: 'child@example.com' }),
            options: { jobId: 'under-minimum-age-u_child' },
          }),
        );
        expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
          where: { userId: 'u_child' },
        });
        // Sockets opened before are closed too.
        expect(mockEventEmitter.emit).toHaveBeenCalledWith(
          'user.session.terminate',
          expect.objectContaining({ userId: 'u_child' }),
        );
        expect(mockOutboxService.triggerImmediatePublish).toHaveBeenCalled();
      });

      it('a repeated event finds the account already inactive and sends nothing again', async () => {
        mockPrismaService.user.updateMany.mockResolvedValue({ count: 0 });

        await under16();

        expect(mockPrismaService.adminAuditLog.create).not.toHaveBeenCalled();
        expect(mockOutboxService.enqueue).not.toHaveBeenCalled();
        expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
          'user.session.terminate',
          expect.anything(),
        );
      });
    });

    it('16 and over: verifies and never touches whether the account is active', async () => {
      const birthYear = new Date().getFullYear() - 17;
      await service.handleIdentityWebhook({
        id: 'vs_teen',
        status: 'verified',
        metadata: { userId: 'u_teen' },
        verified_outputs: {
          dob: { year: birthYear, month: 1, day: 1 },
        },
      } as any);

      // A suspended or banned account stays as it was.
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u_teen' },
        data: {
          identityVerifiedAt: expect.any(Date),
          dateOfBirth: expect.any(Date),
        },
      });
      expect(mockPrismaService.user.updateMany).not.toHaveBeenCalled();
      expect(mockEmailService.underMinimumAgeMail).not.toHaveBeenCalled();
    });

    it('clears stripeIdentitySessionId on canceled or requires_input status', async () => {
      await service.handleIdentityWebhook({
        id: 'vs_canceled',
        status: 'canceled',
        metadata: { userId: 'u_cancel' },
      } as any);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u_cancel' },
        data: { stripeIdentitySessionId: null },
      });
    });
  });

  describe('syncIdentitySession', () => {
    it('returns no_session when user has no stored stripeIdentitySessionId', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        stripeIdentitySessionId: null,
      });

      const res = await service.syncIdentitySession('u_nosess');
      expect(res).toEqual({ status: 'no_session' });
    });

    it('returns already_verified when user is already verified', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        stripeIdentitySessionId: 'vs_done',
        identityVerifiedAt: new Date(),
      });

      const res = await service.syncIdentitySession('u_verified');
      expect(res).toEqual({ status: 'already_verified' });
    });

    it('syncs verified status from Stripe', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        stripeIdentitySessionId: 'vs_ver',
        identityVerifiedAt: null,
      });
      mockStripeService.getIdentityVerificationSession.mockResolvedValue({
        status: 'verified',
        verified_outputs: null,
      });

      const res = await service.syncIdentitySession('u_sync_ver');
      expect(res).toEqual({ status: 'verified' });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u_sync_ver' },
          data: expect.objectContaining({
            identityVerifiedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('clears session id when status is canceled or requires_input', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        stripeIdentitySessionId: 'vs_req_in',
        identityVerifiedAt: null,
      });
      mockStripeService.getIdentityVerificationSession.mockResolvedValue({
        status: 'requires_input',
      });

      const res = await service.syncIdentitySession('u_req');
      expect(res).toEqual({ status: 'requires_input' });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u_req' },
        data: { stripeIdentitySessionId: null },
      });
    });

    it('returns other statuses without modifying DB', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        stripeIdentitySessionId: 'vs_proc',
        identityVerifiedAt: null,
      });
      mockStripeService.getIdentityVerificationSession.mockResolvedValue({
        status: 'processing',
      });

      const res = await service.syncIdentitySession('u_proc');
      expect(res).toEqual({ status: 'processing' });
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('syncUserTier', () => {
    it('clears the cached public profile when the level changes, and only then', async () => {
      const profile = (verificationLevel: VerificationLevel) => ({
        id: 'p_down',
        username: 'ana',
        accountType: AccountType.CREATOR,
        verificationLevel,
        platformSubscriptions: [],
      });
      mockCacheManager.del.mockClear();

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u_down',
        profiles: [profile(VerificationLevel.ELITE)],
      });
      await service.syncUserTier('u_down');
      expect(mockCacheManager.del).toHaveBeenCalledWith('profile:ana');

      mockCacheManager.del.mockClear();
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u_down',
        profiles: [profile(VerificationLevel.BASIC)],
      });
      await service.syncUserTier('u_down');
      expect(mockCacheManager.del).not.toHaveBeenCalled();
    });

    it('pauses the team of each Profile that leaves the Business plan', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u_shop',
        profiles: [
          {
            id: 'p_shop',
            username: 'shop',
            verificationLevel: VerificationLevel.BUSINESS,
            platformSubscriptions: [],
          },
        ],
      });
      mockPrismaService.profile.findUnique.mockResolvedValue({
        accountType: 'BUSINESS',
        verificationLevel: VerificationLevel.BASIC,
      });
      mockPrismaService.profileMember.updateMany.mockResolvedValue({
        count: 2,
      });

      await service.syncUserTier('u_shop');

      expect(mockPrismaService.profileMember.updateMany).toHaveBeenCalledWith({
        where: { profileId: 'p_shop', status: 'ACTIVE' },
        data: { status: 'PAUSED' },
      });
    });

    it('returns early when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await service.syncUserTier('u_none');
      expect(mockPrismaService.profile.update).not.toHaveBeenCalled();
    });

    it('sets BUSINESS verification for business plans without touching Account Type', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u_biz',
        profiles: [
          {
            id: 'p_biz',
            accountType: AccountType.PERSONAL,
            verificationLevel: VerificationLevel.BASIC,
            platformSubscriptions: [
              {
                status: SubscriptionStatus.ACTIVE,
                plan: { name: 'Business Pro' },
              },
            ],
          },
        ],
      });

      await service.syncUserTier('u_biz');

      expect(mockPrismaService.profile.update).toHaveBeenCalledWith({
        where: { id: 'p_biz' },
        data: { verificationLevel: VerificationLevel.BUSINESS },
      });
    });

    it('sets ELITE verification for elite plans without touching Account Type', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u1',
        profiles: [
          {
            id: 'p1',
            accountType: AccountType.PERSONAL,
            verificationLevel: VerificationLevel.BASIC,
            platformSubscriptions: [
              { status: SubscriptionStatus.ACTIVE, plan: { name: 'Elite' } },
            ],
          },
        ],
      });

      await service.syncUserTier('u1');

      expect(mockPrismaService.profile.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { verificationLevel: VerificationLevel.ELITE },
      });
    });

    it('sets VERIFIED for the legacy Premium plan name', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u_prem',
        profiles: [
          {
            id: 'p_prem',
            accountType: AccountType.PERSONAL,
            verificationLevel: VerificationLevel.BASIC,
            platformSubscriptions: [
              {
                status: SubscriptionStatus.ACTIVE,
                plan: { name: 'Premium Plan' },
              },
            ],
          },
        ],
      });

      await service.syncUserTier('u_prem');

      expect(mockPrismaService.profile.update).toHaveBeenCalledWith({
        where: { id: 'p_prem' },
        data: { verificationLevel: VerificationLevel.VERIFIED },
      });
    });

    it('does not update profile if verificationLevel already matches', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u_match',
        profiles: [
          {
            id: 'p_match',
            accountType: AccountType.BUSINESS,
            verificationLevel: VerificationLevel.BUSINESS,
            platformSubscriptions: [
              { status: SubscriptionStatus.ACTIVE, plan: { name: 'Business' } },
            ],
          },
        ],
      });

      await service.syncUserTier('u_match');
      expect(mockPrismaService.profile.update).not.toHaveBeenCalled();
    });

    it('sets VERIFIED for the current Verified plan name (regression)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u_ver',
        profiles: [
          {
            id: 'p_ver',
            accountType: AccountType.PERSONAL,
            verificationLevel: VerificationLevel.BASIC,
            platformSubscriptions: [
              { status: SubscriptionStatus.ACTIVE, plan: { name: 'Verified' } },
            ],
          },
        ],
      });

      await service.syncUserTier('u_ver');

      expect(mockPrismaService.profile.update).toHaveBeenCalledWith({
        where: { id: 'p_ver' },
        data: { verificationLevel: VerificationLevel.VERIFIED },
      });
    });

    it('downgrades verification to BASIC without plans and keeps a user-chosen Creator type', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u_downgrade',
        profiles: [
          {
            id: 'p_down',
            accountType: AccountType.CREATOR,
            verificationLevel: VerificationLevel.ELITE,
            platformSubscriptions: [],
          },
        ],
      });

      await service.syncUserTier('u_downgrade');

      expect(mockPrismaService.profile.update).toHaveBeenCalledWith({
        where: { id: 'p_down' },
        data: { verificationLevel: VerificationLevel.BASIC },
      });
    });
  });
});
