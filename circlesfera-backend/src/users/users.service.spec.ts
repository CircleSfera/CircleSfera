import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AccountType,
  ContentRating,
  SubscriptionStatus,
  VerificationLevel,
  Visibility,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeService } from '../common/stripe/stripe.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ContentPreferenceDto,
  VisibilityDto,
} from './dto/update-settings.dto.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = {
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
    },
    profile: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    userSettings: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
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

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((cb: any) =>
      cb(mockPrismaService),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StripeService, useValue: mockStripeService },
        { provide: OutboxService, useValue: mockOutboxService },
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
      });
      const result = await service.banUser('1');
      expect(result.isActive).toBe(false);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isActive: false },
      });
    });

    it('should unban a user', async () => {
      mockPrismaService.profile.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.user.update.mockResolvedValue({
        id: '1',
        isActive: true,
      });
      const result = await service.unbanUser('1');
      expect(mockPrismaService.profile.updateMany).toHaveBeenCalledWith({
        where: { userId: '1' },
        data: { suspendedUntil: null },
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
        supportTickets: [],
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

      const res = await service.exportUserData('u_exp');

      expect(res.id).toBe('u_exp');
      expect(res.email).toBe('exp@test.com');
      expect(res.network).toEqual(
        expect.objectContaining({ signupIp: '1.2.3.4', signupCountry: 'ES' }),
      );
      expect((res.devices as any).count).toBe(1);
      expect((res.profiles as any[])[0].messages.items).toHaveLength(1);
      expect(res.sentTransactions).toHaveLength(1);
      expect(res.receivedTransactions).toHaveLength(1);
    });
  });

  describe('deleteUser and deleteScheduledUser', () => {
    it('deleteUser deletes existing user inside transaction', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u_del' });
      mockPrismaService.user.delete.mockResolvedValue({ id: 'u_del' });

      const res = await service.deleteUser('u_del');
      expect(res).toEqual({ id: 'u_del' });
      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
        where: { id: 'u_del' },
      });
    });

    it('deleteUser throws error when user does not exist in transaction', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteUser('u_missing')).rejects.toThrow(
        'User not found',
      );
      expect(mockPrismaService.user.delete).not.toHaveBeenCalled();
    });

    it('deleteScheduledUser returns true when user is deleted', async () => {
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
    });

    it('deleteScheduledUser returns false when count is 0', async () => {
      mockPrismaService.user.deleteMany.mockResolvedValue({ count: 0 });
      const res = await service.deleteScheduledUser('u_restored');
      expect(res).toBe(false);
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
      expect(mockOutboxService.enqueue).toHaveBeenCalled();
      expect(mockOutboxService.triggerImmediatePublish).toHaveBeenCalled();
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

  describe('getSettings and updateSettings', () => {
    it('getSettings returns existing settings', async () => {
      mockPrismaService.userSettings.findUnique.mockResolvedValue({
        userId: 'u_set',
        privacyLevel: 'PUBLIC',
      });

      const res = await service.getSettings('u_set');
      expect(res.privacyLevel).toBe('PUBLIC');
      expect(mockPrismaService.userSettings.create).not.toHaveBeenCalled();
    });

    it('getSettings creates default settings if none exist', async () => {
      mockPrismaService.userSettings.findUnique.mockResolvedValue(null);
      mockPrismaService.userSettings.create.mockResolvedValue({
        userId: 'u_new_set',
        privacyLevel: 'PUBLIC',
      });

      const res = await service.getSettings('u_new_set');
      expect(mockPrismaService.userSettings.create).toHaveBeenCalledWith({
        data: { userId: 'u_new_set' },
      });
      expect(res.userId).toBe('u_new_set');
    });

    it('updateSettings upserts settings with provided and fallback values', async () => {
      mockPrismaService.userSettings.upsert.mockResolvedValue({
        userId: 'u_up_set',
        privacyLevel: Visibility.PRIVATE,
        contentPreference: ContentRating.MATURE,
      });

      const res = await service.updateSettings('u_up_set', {
        privacyLevel: VisibilityDto.PRIVATE,
        contentPreference: ContentPreferenceDto.MATURE,
        blurSensitiveContent: false,
        emailNotifications: false,
        pushNotifications: false,
        isOnboarded: true,
      });

      expect(mockPrismaService.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId: 'u_up_set' },
        update: {
          privacyLevel: Visibility.PRIVATE,
          contentPreference: ContentRating.MATURE,
          blurSensitiveContent: false,
          emailNotifications: false,
          pushNotifications: false,
          isOnboarded: true,
        },
        create: {
          userId: 'u_up_set',
          privacyLevel: Visibility.PRIVATE,
          contentPreference: ContentRating.MATURE,
          blurSensitiveContent: false,
          emailNotifications: false,
          pushNotifications: false,
          isOnboarded: true,
        },
      });
      expect(res.privacyLevel).toBe(Visibility.PRIVATE);
    });

    it('updateSettings handles partial DTO with default fallbacks for create', async () => {
      mockPrismaService.userSettings.upsert.mockResolvedValue({});

      await service.updateSettings('u_partial', {} as any);

      expect(mockPrismaService.userSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            privacyLevel: Visibility.PUBLIC,
            contentPreference: ContentRating.GENERAL,
            blurSensitiveContent: true,
            emailNotifications: true,
            pushNotifications: true,
            isOnboarded: false,
          }),
        }),
      );
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
          data: expect.objectContaining({ isActive: true }),
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
          data: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('handles verified status and sets isActive false if user is under 16', async () => {
      const birthYear = new Date().getFullYear() - 14;
      await service.handleIdentityWebhook({
        id: 'vs_under16',
        status: 'verified',
        metadata: { userId: 'u_child' },
        verified_outputs: {
          dob: { year: birthYear, month: 1, day: 1 },
        },
      } as any);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u_child' },
        data: {
          identityVerifiedAt: expect.any(Date),
          dateOfBirth: expect.any(Date),
          isActive: false,
        },
      });
    });

    it('handles verified status for user aged 17 (between 16 and 18)', async () => {
      const birthYear = new Date().getFullYear() - 17;
      await service.handleIdentityWebhook({
        id: 'vs_teen',
        status: 'verified',
        metadata: { userId: 'u_teen' },
        verified_outputs: {
          dob: { year: birthYear, month: 1, day: 1 },
        },
      } as any);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u_teen' },
        data: {
          identityVerifiedAt: expect.any(Date),
          dateOfBirth: expect.any(Date),
          isActive: true,
        },
      });
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
          data: expect.objectContaining({ isActive: true }),
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
    it('returns early when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await service.syncUserTier('u_none');
      expect(mockPrismaService.profile.update).not.toHaveBeenCalled();
    });

    it('promotes profile to BUSINESS account and BUSINESS verification for business plans', async () => {
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
        data: {
          accountType: AccountType.BUSINESS,
          verificationLevel: VerificationLevel.BUSINESS,
        },
      });
    });

    it('promotes profile to CREATOR and ELITE for elite plans', async () => {
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
        data: {
          accountType: AccountType.CREATOR,
          verificationLevel: VerificationLevel.ELITE,
        },
      });
    });

    it('promotes verification to VERIFIED for premium plans while keeping personal account', async () => {
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
        data: {
          accountType: AccountType.PERSONAL,
          verificationLevel: VerificationLevel.VERIFIED,
        },
      });
    });

    it('does not update profile if accountType and verificationLevel already match target', async () => {
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

    it('downgrades to BASIC when no active subscriptions exist', async () => {
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
        data: {
          accountType: AccountType.PERSONAL,
          verificationLevel: VerificationLevel.BASIC,
        },
      });
    });
  });
});
