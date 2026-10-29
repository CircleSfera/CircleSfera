import { ErrorCode } from '@circlesfera/shared';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_FEE_DECIMAL } from '../common/constants/monetization.constants.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MonetizationService } from './monetization.service.js';

describe('MonetizationService', () => {
  let service: MonetizationService;
  const accounts = new Map<string, string>();

  const mockPrismaService = {
    monetization: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    profile: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'creator-prof-1',
          accountType: 'CREATOR',
          user: { stripeConnectAccountId: 'acct_creator' },
        },
      ]),
    },
    transaction: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    post: {
      findUnique: vi.fn(),
    },
    story: {
      findUnique: vi.fn(),
    },
    storyUnlock: {
      findUnique: vi.fn(),
    },
    message: {
      findUnique: vi.fn(),
    },
    messageUnlock: {
      findUnique: vi.fn(),
    },
    block: {
      findFirst: vi.fn(),
    },
  };

  const mockStripeService = {
    createCheckoutSession: vi.fn(),
    cardOnlyPaymentMethods: vi.fn(() => ({
      payment_method_configuration: 'pmc_cardonly',
    })),
    createExpressAccount: vi.fn(),
    createAccountLink: vi.fn(),
    getAccount: vi.fn(),
    createLoginLink: vi.fn(),
    getConnectBalance: vi.fn(),
    listConnectPayouts: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonetizationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StripeService, useValue: mockStripeService },
      ],
    }).compile();

    service = module.get<MonetizationService>(MonetizationService);
    vi.clearAllMocks();
    // A Profile paid is in good standing unless a test says otherwise.
    mockPrismaService.profile.findUnique.mockResolvedValue({
      isAccountBanned: false,
      suspendedUntil: null,
      user: { isActive: true, isRootBanned: false, deletedAt: null },
    });
    // The rows of earnings: which person holds which payout account.
    accounts.clear();
    mockPrismaService.monetization.findUnique.mockImplementation(
      async ({ where }: { where: { userId?: string } }) => {
        const account = where.userId && accounts.get(where.userId);
        return account
          ? {
              // The person's row, held by their Profile prof-1.
              userId: where.userId,
              profileId: 'prof-1',
              stripeConnectAccountId: account,
              transfersEnabled: false,
              chargesEnabled: false,
              verifiedCompany: false,
            }
          : null;
      },
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMonetization', () => {
    it('should return monetization and stripe status when record exists', async () => {
      mockPrismaService.monetization.findUnique.mockResolvedValue({
        userId: 'user-1',
        profileId: 'creator-prof-1',
        stripeConnectAccountId: 'acct_123',
        lifetimeEarningsCents: 5000,
      });

      const result = await service.getMonetization('user-1', 'prof-1');
      expect(result).toHaveProperty('hasStripeAccount', true);
      expect(result.lifetimeEarningsCents).toBe(5000);
      // The account and the Profile holding it stay on the server.
      expect(result).not.toHaveProperty('stripeConnectAccountId');
      expect(result).not.toHaveProperty('profileId');
    });

    it('should create monetization record if none exists', async () => {
      mockPrismaService.monetization.findUnique.mockResolvedValue(null);
      mockPrismaService.monetization.create.mockResolvedValue({
        userId: 'user-2',
        lifetimeEarningsCents: 0,
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        stripeConnectAccountId: null,
      });

      const result = await service.getMonetization('user-2', 'prof-1');
      expect(mockPrismaService.monetization.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          profileId: 'creator-prof-1',
          stripeConnectAccountId: 'acct_creator',
        },
      });
      expect(result).toHaveProperty('hasStripeAccount', false);
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions with profiles and default pagination', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([
        {
          id: 'tx-1',
          amountCents: 1000,
          sender: {
            id: 'u-1',
            profiles: [{ username: 'sender1', avatar: 'a.jpg' }],
          },
          receiver: {
            id: 'u-2',
            profiles: [{ username: 'rec1', avatar: 'b.jpg' }],
          },
        },
        {
          id: 'tx-2',
          amountCents: 500,
          sender: null,
          receiver: null,
        },
      ]);
      mockPrismaService.transaction.count.mockResolvedValue(2);

      const result = await service.getTransactions('user-1');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].sender?.profile?.username).toBe('sender1');
      expect(result.data[1].sender).toBeNull();
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });
  });

  describe('createPostUnlockSession', () => {
    it('should throw if post is not found or not premium or has no price', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createPostUnlockSession(
          'user-1',
          'profile-1',
          'post-none',
          'http://localhost/return',
        ),
      ).rejects.toThrow('This post is not premium or has no price');

      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'post-1',
        isPremium: true,
        priceCents: 0,
      });
      await expect(
        service.createPostUnlockSession(
          'user-1',
          'profile-1',
          'post-1',
          'http://localhost/return',
        ),
      ).rejects.toThrow('This post is not premium or has no price');
    });

    it('should throw if buyer is buying own post', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        isPremium: true,
        priceCents: 500,
        profileId: 'profile-1',
      });

      await expect(
        service.createPostUnlockSession(
          'user-1',
          'profile-1',
          'post-1',
          'http://localhost/return',
        ),
      ).rejects.toThrow('You cannot buy your own post');
    });

    it('should throw if creator has no stripeConnectAccountId', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        isPremium: true,
        priceCents: 500,
        profileId: 'profile-creator',
        profile: {
          user: {
            id: 'creator-1',
            stripeConnectAccountId: null,
          },
        },
      });

      await expect(
        service.createPostUnlockSession(
          'user-1',
          'profile-buyer',
          'post-1',
          'http://localhost/return',
        ),
      ).rejects.toThrow('Creator has not setup their Stripe account');
    });

    it('should throw if buyer is not found', async () => {
      accounts.set('creator-1', 'acct_creator');
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        isPremium: true,
        priceCents: 500,
        profileId: 'profile-creator',
        profile: {
          user: {
            id: 'creator-1',
            stripeConnectAccountId: 'acct_creator',
          },
        },
      });
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createPostUnlockSession(
          'user-not-found',
          'profile-buyer',
          'post-1',
          'http://localhost/return',
        ),
      ).rejects.toThrow('Buyer not found');
    });

    it('creates Checkout with post price, 20% platform fee, and handles returnUrl with query params', async () => {
      accounts.set('creator-1', 'acct_1');
      const priceCents = 1000;
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        isPremium: true,
        priceCents,
        profileId: 'creator-profile',
        profile: {
          username: 'ana',
          user: {
            id: 'creator-1',
            email: 'creator@example.com',
            // What the person's column held before the rows: no longer read.
            stripeConnectAccountId: 'acct_person_column',
          },
        },
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'fan-1',
        email: 'fan@example.com',
      });
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.test/unlock',
      });

      const res = await service.createPostUnlockSession(
        'fan-1',
        'fan-profile',
        'post-1',
        'http://localhost/return?foo=bar',
        'idemp-1',
      );

      expect(res.url).toBe('https://checkout.stripe.test/unlock');
      // Only the checkout of a paid message is shortened.
      expect(
        mockStripeService.createCheckoutSession.mock.calls[0][0],
      ).not.toHaveProperty('expires_at');
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url:
            'http://localhost/return?foo=bar&success=true&session_id={CHECKOUT_SESSION_ID}',
          cancel_url: 'http://localhost/return?foo=bar&canceled=true',
          payment_intent_data: {
            application_fee_amount: 200,
            transfer_data: { destination: 'acct_1' },
          },
        }),
        { idempotencyKey: 'idemp-1' },
      );
      // Who pays sees the Profile, never the creator's email.
      const [session] = mockStripeService.createCheckoutSession.mock.calls[0];
      expect(JSON.stringify(session)).toContain('@ana');
      expect(JSON.stringify(session)).not.toContain('creator@example.com');
    });
  });

  describe('createStoryUnlockSession', () => {
    it('should throw if story not found or not premium or has no price', async () => {
      mockPrismaService.story.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createStoryUnlockSession(
          'user-1',
          'prof-1',
          's-1',
          'http://return',
        ),
      ).rejects.toThrow('This story is not premium or has no price');

      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        id: 's-1',
        isPremium: false,
        priceCents: 500,
      });
      await expect(
        service.createStoryUnlockSession(
          'user-1',
          'prof-1',
          's-1',
          'http://return',
        ),
      ).rejects.toThrow('This story is not premium or has no price');
    });

    it('should throw if buyer is buying own story', async () => {
      mockPrismaService.story.findUnique.mockResolvedValue({
        id: 's-1',
        isPremium: true,
        priceCents: 500,
        profileId: 'prof-creator',
      });
      await expect(
        service.createStoryUnlockSession(
          'user-1',
          'prof-creator',
          's-1',
          'http://return',
        ),
      ).rejects.toThrow('You cannot buy your own story');
    });

    it('should throw if story is already unlocked', async () => {
      mockPrismaService.story.findUnique.mockResolvedValue({
        id: 's-1',
        isPremium: true,
        priceCents: 500,
        profileId: 'prof-creator',
      });
      mockPrismaService.storyUnlock.findUnique.mockResolvedValue({
        id: 'su-1',
      });

      await expect(
        service.createStoryUnlockSession(
          'user-1',
          'prof-buyer',
          's-1',
          'http://return',
        ),
      ).rejects.toThrow('Story already unlocked');
    });

    it('should throw if creator has not setup stripe account', async () => {
      mockPrismaService.story.findUnique.mockResolvedValue({
        id: 's-1',
        isPremium: true,
        priceCents: 500,
        profileId: 'prof-creator',
        profile: {
          user: { id: 'c-1', stripeConnectAccountId: null },
        },
      });
      mockPrismaService.storyUnlock.findUnique.mockResolvedValue(null);

      await expect(
        service.createStoryUnlockSession(
          'user-1',
          'prof-buyer',
          's-1',
          'http://return',
        ),
      ).rejects.toThrow('Creator has not setup their Stripe account');
    });

    it('should throw if buyer is not found', async () => {
      accounts.set('c-1', 'acct_1');
      mockPrismaService.story.findUnique.mockResolvedValue({
        id: 's-1',
        isPremium: true,
        priceCents: 500,
        profileId: 'prof-creator',
        profile: {
          user: { id: 'c-1', stripeConnectAccountId: 'acct_1' },
        },
      });
      mockPrismaService.storyUnlock.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createStoryUnlockSession(
          'user-not-found',
          'prof-buyer',
          's-1',
          'http://return',
        ),
      ).rejects.toThrow('Buyer not found');
    });

    it('creates Checkout for story unlock with the 20% platform fee', async () => {
      accounts.set('c-1', 'acct_1');
      mockPrismaService.story.findUnique.mockResolvedValue({
        id: 's-1',
        isPremium: true,
        priceCents: 600,
        profileId: 'prof-creator',
        profile: {
          user: {
            id: 'c-1',
            email: 'c@c.com',
            stripeConnectAccountId: 'acct_1',
          },
        },
      });
      mockPrismaService.storyUnlock.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'u@u.com',
      });
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.test/story',
      });

      const res = await service.createStoryUnlockSession(
        'u-1',
        'prof-buyer',
        's-1',
        'http://return',
      );

      expect(res.url).toBe('https://checkout.stripe.test/story');
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent_data: {
            application_fee_amount: 120,
            transfer_data: { destination: 'acct_1' },
          },
          metadata: {
            type: 'DIRECT_STORY_UNLOCK',
            storyId: 's-1',
            creatorId: 'c-1',
            // The buyer's consent, kept with the payment.
            withdrawal_consent: 'accepted',
            withdrawal_consent_version: '2026-1',
          },
        }),
        { idempotencyKey: undefined },
      );
    });
  });

  describe('createMessageUnlockSession', () => {
    it.each([
      ['is gone', null],
      [
        'was deleted by its sender',
        { id: 'm-1', isLocked: true, priceCents: 500, isDeleted: true },
      ],
    ])(
      'answers not found, and starts no checkout, when the message %s',
      async (_case, message) => {
        mockPrismaService.message.findUnique.mockResolvedValueOnce(message);

        await expect(
          service.createMessageUnlockSession('user-1', 'm-1', 'http://return'),
        ).rejects.toMatchObject({
          errorCode: ErrorCode.MESSAGE_NOT_FOUND,
          status: 404,
        });
        expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
      },
    );

    it('should throw if message is not locked or has no price', async () => {
      mockPrismaService.message.findUnique.mockResolvedValueOnce({
        id: 'm-1',
        isLocked: false,
        priceCents: 500,
      });
      await expect(
        service.createMessageUnlockSession('user-1', 'm-1', 'http://return'),
      ).rejects.toThrow('This message is not locked or has no price');
    });

    it('should throw if the stored price is outside the €3.00-€500.00 bounds (defense-in-depth)', async () => {
      mockPrismaService.message.findUnique.mockResolvedValueOnce({
        id: 'm-1',
        isLocked: true,
        priceCents: 100,
        senderId: 'creator-profile-1',
      });
      await expect(
        service.createMessageUnlockSession('user-1', 'm-1', 'http://return'),
      ).rejects.toThrow(/entre €3.00 y €500.00/);

      mockPrismaService.message.findUnique.mockResolvedValueOnce({
        id: 'm-1',
        isLocked: true,
        priceCents: 100_000,
        senderId: 'creator-profile-1',
      });
      await expect(
        service.createMessageUnlockSession('user-1', 'm-1', 'http://return'),
      ).rejects.toThrow(/entre €3.00 y €500.00/);
    });

    it('should throw if sender (by User.id, not Profile.id) is unlocking own message', async () => {
      // Regression test (CodeRabbit finding): message.senderId is a
      // Profile.id, but the caller passes a User.id — comparing them
      // directly never fires. Must compare against sender.user.id instead.
      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-1',
        isLocked: true,
        priceCents: 500,
        senderId: 'creator-profile-1',
        sender: { id: 'creator-profile-1', user: { id: 'creator-user-1' } },
      });
      await expect(
        service.createMessageUnlockSession(
          'creator-user-1',
          'm-1',
          'http://return',
        ),
      ).rejects.toThrow('You cannot unlock your own message');
    });

    it('should throw if message is already unlocked', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-1',
        isLocked: true,
        priceCents: 500,
        senderId: 'creator-profile-1',
        sender: { id: 'creator-profile-1', user: { id: 'creator-user-1' } },
      });
      mockPrismaService.messageUnlock.findUnique.mockResolvedValue({
        id: 'mu-1',
      });

      await expect(
        service.createMessageUnlockSession('user-1', 'm-1', 'http://return'),
      ).rejects.toThrow('Message already unlocked');
    });

    it('should throw if creator has no stripe account', async () => {
      // Regression test (CodeRabbit finding): stripeConnectAccountId lives
      // on User, not Profile — message.sender (Profile) never has it.
      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-1',
        isLocked: true,
        priceCents: 500,
        senderId: 'creator-profile-1',
        sender: {
          id: 'creator-profile-1',
          user: { id: 'creator-user-1', stripeConnectAccountId: null },
        },
      });
      mockPrismaService.messageUnlock.findUnique.mockResolvedValue(null);

      await expect(
        service.createMessageUnlockSession('user-1', 'm-1', 'http://return'),
      ).rejects.toThrow('Creator has not setup their Stripe account');
    });

    it('should throw if buyer is not found', async () => {
      accounts.set('creator-user-1', 'acct_1');
      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-1',
        isLocked: true,
        priceCents: 500,
        senderId: 'creator-profile-1',
        sender: {
          id: 'creator-profile-1',
          user: { id: 'creator-user-1', stripeConnectAccountId: 'acct_1' },
        },
      });
      mockPrismaService.messageUnlock.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createMessageUnlockSession(
          'user-not-found',
          'm-1',
          'http://return',
        ),
      ).rejects.toThrow('Buyer not found');
    });

    it('creates Checkout for locked message with 20% platform fee, using the creator User.id', async () => {
      accounts.set('creator-user-1', 'acct_1');
      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-1',
        isLocked: true,
        priceCents: 500,
        senderId: 'creator-profile-1',
        sender: {
          id: 'creator-profile-1',
          user: {
            id: 'creator-user-1',
            email: 'c@c.com',
            stripeConnectAccountId: 'acct_1',
          },
        },
      });
      mockPrismaService.messageUnlock.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'u@u.com',
      });
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.test/message',
      });

      const before = Math.floor(Date.now() / 1000);
      const res = await service.createMessageUnlockSession(
        'u-1',
        'm-1',
        'http://return',
      );
      const after = Math.floor(Date.now() / 1000);

      expect(res.url).toBe('https://checkout.stripe.test/message');
      // The checkout closes after about 30 minutes, the shortest Stripe
      // allows, instead of its default of a day.
      const [session] = mockStripeService.createCheckoutSession.mock.calls[0];
      expect(session.expires_at).toBeGreaterThanOrEqual(before + 30 * 60);
      expect(session.expires_at).toBeLessThanOrEqual(after + 31 * 60);
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent_data: {
            application_fee_amount: 100,
            transfer_data: { destination: 'acct_1' },
          },
          metadata: {
            type: 'DIRECT_MESSAGE_UNLOCK',
            messageId: 'm-1',
            creatorId: 'creator-user-1',
            // The buyer's consent, kept with the payment.
            withdrawal_consent: 'accepted',
            withdrawal_consent_version: '2026-1',
          },
        }),
        { idempotencyKey: undefined },
      );
    });
  });

  describe('createTipSession', () => {
    // Tip minimum is MIN_TIP_CENTS (€2.00), independent of
    // MIN_PPV_PRICE_CENTS (the pay-per-view price floor).
    const tipCents = 500;

    // A Profile that may receive a tip, of the person given.
    const tippable = (userId: string, over: object = {}) => ({
      id: `${userId}-profile`,
      userId,
      username: `${userId}_name`,
      isAccountBanned: false,
      suspendedUntil: null,
      user: { isActive: true, isRootBanned: false, deletedAt: null },
      ...over,
    });

    beforeEach(() => {
      // By default the tests name a person, whose first Profile is checked.
      mockPrismaService.profile.findUnique.mockReset().mockResolvedValue(null);
      mockPrismaService.profile.findFirst
        .mockReset()
        .mockImplementation(async ({ where }: { where: { userId: string } }) =>
          tippable(where.userId),
        );
      mockPrismaService.user.findUnique.mockReset();
      mockPrismaService.block.findFirst.mockReset().mockResolvedValue(null);
      // Both sides are real accounts, of one audience.
      mockPrismaService.user.findMany.mockReset().mockResolvedValue([]);
      mockPrismaService.post.findUnique.mockReset();
    });

    it('should throw if amount is below the €2.00 minimum, in euros', async () => {
      await expect(
        service.createTipSession(
          'user-1',
          'creator-1',
          199,
          'http://localhost/return',
        ),
      ).rejects.toThrow('Minimum tip is €2.00');
    });

    it('should throw if tipping yourself', async () => {
      await expect(
        service.createTipSession(
          'user-1',
          'user-1',
          tipCents,
          'http://localhost/return',
        ),
      ).rejects.toThrow();
    });

    it('should throw if receiver has not setup Stripe', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createTipSession(
          'user-1',
          'creator-1',
          tipCents,
          'http://localhost/return',
        ),
      ).rejects.toThrow('Creator cannot receive tips yet (no Stripe account)');
    });

    it('should throw if sender is not found', async () => {
      accounts.set('creator-1', 'acct_1');
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createTipSession(
          'sender-not-found',
          'creator-1',
          tipCents,
          'http://localhost/return',
        ),
      ).rejects.toThrow('Sender not found');
    });

    it('creates Checkout with the requested amount and the platform fee', async () => {
      accounts.set('creator-1', 'acct_1');
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'fan-1',
        email: 'fan@example.com',
      });
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.test/tip',
      });

      // The post is one of the person tipped.
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        profileId: 'creator-1-profile',
        profile: tippable('creator-1'),
      });

      const result = await service.createTipSession(
        'fan-1',
        'creator-1',
        tipCents,
        'http://localhost/return',
        'post-123',
        'idemp-tip',
      );

      expect(result.url).toBe('https://checkout.stripe.test/tip');
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          // One-off payments use the card-only Payment Method Configuration.
          payment_method_configuration: 'pmc_cardonly',
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({ unit_amount: tipCents }),
            }),
          ],
          payment_intent_data: expect.objectContaining({
            application_fee_amount: Math.floor(tipCents * PLATFORM_FEE_DECIMAL),
          }),
          metadata: {
            type: 'DIRECT_TIP',
            creatorId: 'creator-1',
            // A person was named: no Profile is kept.
            profileId: '',
            senderProfileId: '',
            postId: 'post-123',
          },
        }),
        { idempotencyKey: 'idemp-tip' },
      );
    });

    it('pays the person behind the Profile tipped, and shows who pays the Profile, never an email', async () => {
      accounts.set('creator-1', 'acct_1');
      mockPrismaService.profile.findUnique.mockResolvedValueOnce(
        tippable('creator-1', { id: 'hobby-profile', username: 'ana_hobby' }),
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'fan-1',
        email: 'fan@example.com',
      });
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.test/tip',
      });

      await service.createTipSession(
        'fan-1',
        'hobby-profile',
        tipCents,
        'http://localhost/return',
      );

      // The account is the one of the person's row: the Profile tipped holds
      // none of its own.
      expect(mockPrismaService.monetization.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'creator-1' } }),
      );
      const [session] = mockStripeService.createCheckoutSession.mock.calls[0];
      expect(session.metadata.creatorId).toBe('creator-1');
      // The Profile tipped is kept with the tip.
      expect(session.metadata.profileId).toBe('hobby-profile');
      expect(JSON.stringify(session)).toContain('Tip for @ana_hobby');
      expect(JSON.stringify(session)).not.toContain('creator@example.com');
    });

    it('refuses a tip to another Profile of oneself', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValueOnce(
        tippable('fan-1', { id: 'my-other-profile' }),
      );

      await expect(
        service.createTipSession(
          'fan-1',
          'my-other-profile',
          tipCents,
          'http://localhost/return',
        ),
      ).rejects.toThrow('Cannot tip yourself');
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it.each([
      ['banned', { isAccountBanned: true }],
      ['suspended', { suspendedUntil: new Date(Date.now() + 3_600_000) }],
      [
        'of a person deactivated',
        { user: { isActive: false, isRootBanned: false, deletedAt: null } },
      ],
      [
        'of a person banned',
        { user: { isActive: true, isRootBanned: true, deletedAt: null } },
      ],
      [
        'of a person deleted',
        {
          user: { isActive: true, isRootBanned: false, deletedAt: new Date() },
        },
      ],
    ])('finds no Profile %s to tip', async (_name, state) => {
      mockPrismaService.profile.findUnique.mockResolvedValueOnce(
        tippable('creator-1', { id: 'p-tipped', ...state }),
      );

      await expect(
        service.createTipSession('fan-1', 'p-tipped', tipCents, 'http://r'),
      ).rejects.toThrow('Creator not found');
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('tips a Profile whose suspension has ended', async () => {
      accounts.set('creator-1', 'a');
      mockPrismaService.profile.findUnique.mockResolvedValueOnce(
        tippable('creator-1', {
          id: 'p-tipped',
          suspendedUntil: new Date(Date.now() - 1000),
        }),
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'fan-1',
        email: 'fan@example.com',
      });
      mockStripeService.createCheckoutSession.mockResolvedValue({ url: 'u' });

      await service.createTipSession('fan-1', 'p-tipped', tipCents, 'http://r');

      expect(mockStripeService.createCheckoutSession).toHaveBeenCalled();
    });

    it('finds no Profile to tip across a block with who tips', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValueOnce(
        tippable('creator-1', { id: 'p-tipped' }),
      );
      mockPrismaService.block.findFirst.mockResolvedValueOnce({ id: 'b-1' });

      await expect(
        service.createTipSession(
          'fan-1',
          'p-tipped',
          tipCents,
          'http://r',
          undefined,
          undefined,
          'fan-profile',
        ),
      ).rejects.toThrow('Creator not found');
      expect(mockPrismaService.block.findFirst).toHaveBeenCalled();
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('takes a post only of the Profile tipped, or of the person named', async () => {
      accounts.set('creator-1', 'a');
      mockPrismaService.profile.findUnique.mockResolvedValue(
        tippable('creator-1', { id: 'p-tipped' }),
      );
      // A post of another Profile of the same person.
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        profileId: 'p-other',
        profile: { userId: 'creator-1' },
      });

      await expect(
        service.createTipSession(
          'fan-1',
          'p-tipped',
          tipCents,
          'http://r',
          'post-of-other',
        ),
      ).rejects.toThrow('Post not found');

      // An unknown post.
      mockPrismaService.post.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createTipSession(
          'fan-1',
          'p-tipped',
          tipCents,
          'http://r',
          'x',
        ),
      ).rejects.toThrow('Post not found');

      // Naming the person, any post of theirs is taken, and its Profile is
      // the one tipped.
      mockPrismaService.profile.findUnique.mockResolvedValue(null);
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        profileId: 'p-other',
        profile: tippable('creator-1', { id: 'p-other' }),
      });
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'fan-1',
        email: 'fan@example.com',
      });
      mockStripeService.createCheckoutSession.mockResolvedValue({ url: 'u' });
      await service.createTipSession(
        'fan-1',
        'creator-1',
        tipCents,
        'http://r',
        'post-of-other',
      );
      const [session] = mockStripeService.createCheckoutSession.mock.calls[0];
      // A person named: no Profile is named or kept.
      expect(session.metadata.profileId).toBe('');
      expect(JSON.stringify(session)).not.toContain('creator-1_name');
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledTimes(1);
    });

    it('naming a person and a post, checks the Profile of the post', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue(null);
      // The person's first Profile is fine; the post is of a banned one.
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        profileId: 'p-banned',
        profile: tippable('creator-1', {
          id: 'p-banned',
          isAccountBanned: true,
        }),
      });
      await expect(
        service.createTipSession(
          'fan-1',
          'creator-1',
          tipCents,
          'http://r',
          'p',
        ),
      ).rejects.toThrow('Creator not found');

      // The post is of a Profile that blocked who tips.
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        profileId: 'p-blocking',
        profile: tippable('creator-1', { id: 'p-blocking' }),
      });
      mockPrismaService.block.findFirst.mockResolvedValueOnce({ id: 'b-1' });
      await expect(
        service.createTipSession(
          'fan-1',
          'creator-1',
          tipCents,
          'http://r',
          'p',
          undefined,
          'fan-profile',
        ),
      ).rejects.toThrow('Creator not found');
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('creates Checkout with omitted postId defaulting to empty string in metadata', async () => {
      accounts.set('creator-1', 'acct_1');
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'fan-1',
        email: 'fan@example.com',
      });
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.test/tip',
      });

      await service.createTipSession(
        'fan-1',
        'creator-1',
        tipCents,
        'http://localhost/return',
      );

      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ postId: '' }),
        }),
        expect.anything(),
      );
    });
  });

  describe('onboardConnectAccount', () => {
    type Row = {
      userId: string | null;
      profileId: string | null;
      stripeConnectAccountId: string | null;
    };
    let rows: Row[] = [];
    // The payout rows, found by their person or by their Profile, and
    // written as the database would.
    const withRows = (...given: Row[]) => {
      rows = given.map((row) => ({ ...row }));
      const find = (where: { userId?: string; profileId?: string }) =>
        rows.find((row) =>
          where.userId
            ? row.userId === where.userId
            : row.profileId === where.profileId,
        ) ?? null;
      mockPrismaService.monetization.findUnique.mockImplementation(
        async ({ where }: { where: { userId?: string; profileId?: string } }) =>
          find(where),
      );
      mockPrismaService.monetization.updateMany.mockImplementation(
        async ({
          where,
          data,
        }: {
          where: { userId: string; OR: Partial<Row>[] };
          data: Partial<Row>;
        }) => {
          const row = rows.find(
            (r) =>
              r.userId === where.userId &&
              where.OR.some((c) =>
                Object.entries(c).every(([k, v]) => r[k as keyof Row] === v),
              ),
          );
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      );
      // One row per person and per Profile, as the unique keys keep it.
      mockPrismaService.monetization.create.mockImplementation(
        async ({ data }: { data: Row }) => {
          if (
            rows.some(
              (r) =>
                (data.userId && r.userId === data.userId) ||
                (data.profileId && r.profileId === data.profileId),
            )
          ) {
            throw Object.assign(new Error('unique'), { code: 'P2002' });
          }
          rows.push({ ...data });
          return data;
        },
      );
      mockPrismaService.monetization.upsert.mockImplementation(
        async ({ create }: { create: Row }) => {
          rows.push({ ...create, userId: create.userId ?? null });
          return create;
        },
      );
    };
    const person = (stripeConnectAccountId: string | null = null) => ({
      id: 'u-1',
      email: 'u1@test.com',
      stripeConnectAccountId,
    });
    const acting = (accountType = 'CREATOR', id = 'prof-2') =>
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id,
        accountType,
      });
    const onboard = (profileId = 'prof-2') =>
      service.onboardConnectAccount(
        'u-1',
        profileId,
        'http://ret',
        'http://ref',
      );

    beforeEach(() => {
      mockStripeService.createAccountLink.mockResolvedValue({
        url: 'https://connect.stripe.com/onboard',
      });
    });

    it('should throw if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(onboard()).rejects.toThrow('User not found');
    });

    it("refuses a Personal Profile, and a Profile that is not the person's", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(person());
      acting('PERSONAL');
      await expect(onboard()).rejects.toThrow(
        'Solo las cuentas Creator o Business pueden habilitar el cobro con Stripe.',
      );

      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      await expect(onboard()).rejects.toThrow(
        'Solo las cuentas Creator o Business pueden habilitar el cobro con Stripe.',
      );
      expect(mockPrismaService.profile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prof-2', userId: 'u-1' } }),
      );
      expect(mockStripeService.createExpressAccount).not.toHaveBeenCalled();
    });

    it("opens the person's first account for the Profile connecting it", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(person());
      acting();
      withRows();
      mockStripeService.createExpressAccount.mockResolvedValue({
        id: 'acct_new',
      });

      const res = await onboard();

      expect(res.url).toBe('https://connect.stripe.com/onboard');
      // One account per person, however many times it is asked.
      expect(mockStripeService.createExpressAccount).toHaveBeenCalledTimes(1);
      expect(mockStripeService.createExpressAccount).toHaveBeenCalledWith(
        'u1@test.com',
        'connect-account-u-1',
      );
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { stripeConnectAccountId: 'acct_new' },
      });
      expect(rows).toEqual([
        {
          userId: 'u-1',
          profileId: 'prof-2',
          stripeConnectAccountId: 'acct_new',
        },
      ]);
      expect(mockStripeService.createAccountLink).toHaveBeenCalledWith(
        'acct_new',
        'http://ret',
        'http://ref',
      );
    });

    it('gives the first account to the Profile connecting it, not to the Personal one the row was opened from', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(person());
      acting();
      withRows({
        userId: 'u-1',
        profileId: 'personal-1',
        stripeConnectAccountId: null,
      });
      mockStripeService.createExpressAccount.mockResolvedValue({
        id: 'acct_new',
      });

      await onboard();

      expect(mockStripeService.createExpressAccount).toHaveBeenCalledTimes(1);
      expect(rows).toEqual([
        {
          userId: 'u-1',
          profileId: 'prof-2',
          stripeConnectAccountId: 'acct_new',
        },
      ]);
    });

    it('never lets two Profiles connecting at once take the same first account', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(person());
      withRows();
      // B reads the person with no account, then waits at the provider while
      // A connects from start to end; the provider answers B the same first
      // account, as the key is the person's.
      let release!: () => void;
      const aDone = new Promise<void>((resolve) => {
        release = resolve;
      });
      mockStripeService.createExpressAccount
        .mockImplementationOnce(async () => {
          await aDone;
          return { id: 'acct_first' };
        })
        .mockResolvedValueOnce({ id: 'acct_first' })
        .mockResolvedValueOnce({ id: 'acct_own' });
      mockPrismaService.profile.findFirst
        .mockResolvedValueOnce({ id: 'prof-b', accountType: 'CREATOR' })
        .mockResolvedValueOnce({ id: 'prof-a', accountType: 'CREATOR' });

      const b = onboard('prof-b');
      await onboard('prof-a');
      release();
      await b;

      expect(rows).toEqual([
        {
          userId: 'u-1',
          profileId: 'prof-a',
          stripeConnectAccountId: 'acct_first',
        },
        {
          userId: null,
          profileId: 'prof-b',
          stripeConnectAccountId: 'acct_own',
        },
      ]);
    });

    it('reuses the account the Profile holds', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        person('acct_existing'),
      );
      acting();
      withRows({
        userId: 'u-1',
        profileId: 'prof-2',
        stripeConnectAccountId: 'acct_existing',
      });

      await onboard();

      expect(mockStripeService.createExpressAccount).not.toHaveBeenCalled();
      expect(mockPrismaService.monetization.updateMany).not.toHaveBeenCalled();
      expect(mockStripeService.createAccountLink).toHaveBeenCalledWith(
        'acct_existing',
        'http://ret',
        'http://ref',
      );
    });

    it('never opens a second account when the row lacks the one the person has, and repairs the row', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        person('acct_existing'),
      );
      acting();
      withRows();

      await onboard();

      expect(mockStripeService.createExpressAccount).not.toHaveBeenCalled();
      expect(rows).toEqual([
        {
          userId: 'u-1',
          profileId: 'prof-2',
          stripeConnectAccountId: 'acct_existing',
        },
      ]);
      expect(mockStripeService.createAccountLink).toHaveBeenCalledWith(
        'acct_existing',
        'http://ret',
        'http://ref',
      );
    });

    it("opens an account of its own for a Profile whose person's account another Profile holds", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(person('acct_first'));
      acting();
      withRows({
        userId: 'u-1',
        profileId: 'prof-1',
        stripeConnectAccountId: 'acct_first',
      });
      mockStripeService.createExpressAccount.mockResolvedValue({
        id: 'acct_second',
      });

      await onboard();

      expect(mockStripeService.createExpressAccount).toHaveBeenCalledWith(
        'u1@test.com',
        'connect-account-prof-2',
      );
      // A row of the Profile only; the person's row and column stay as they are.
      expect(mockPrismaService.monetization.upsert).toHaveBeenCalledWith({
        where: { profileId: 'prof-2' },
        update: { stripeConnectAccountId: 'acct_second' },
        create: { profileId: 'prof-2', stripeConnectAccountId: 'acct_second' },
      });
      expect(rows[0]).toEqual({
        userId: 'u-1',
        profileId: 'prof-1',
        stripeConnectAccountId: 'acct_first',
      });
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
      expect(mockStripeService.createAccountLink).toHaveBeenCalledWith(
        'acct_second',
        'http://ret',
        'http://ref',
      );
    });

    it('reuses the account of its own a second Profile opened before', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(person('acct_first'));
      acting();
      withRows(
        {
          userId: 'u-1',
          profileId: 'prof-1',
          stripeConnectAccountId: 'acct_first',
        },
        {
          userId: null,
          profileId: 'prof-2',
          stripeConnectAccountId: 'acct_second',
        },
      );

      await onboard();

      expect(mockStripeService.createExpressAccount).not.toHaveBeenCalled();
      expect(mockPrismaService.monetization.upsert).not.toHaveBeenCalled();
      expect(mockStripeService.createAccountLink).toHaveBeenCalledWith(
        'acct_second',
        'http://ret',
        'http://ref',
      );
    });

    it('reads the row again when another request opened it at the same moment', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(person('acct_first'));
      acting();
      withRows();
      // The row did not exist when read, and exists when created.
      mockPrismaService.monetization.create.mockImplementationOnce(async () => {
        rows.push({
          userId: 'u-1',
          profileId: 'prof-1',
          stripeConnectAccountId: 'acct_first',
        });
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      });
      mockStripeService.createExpressAccount.mockResolvedValue({
        id: 'acct_second',
      });

      await onboard();

      expect(mockStripeService.createAccountLink).toHaveBeenCalledWith(
        'acct_second',
        'http://ret',
        'http://ref',
      );
    });

    it('lets any other failure of the row through', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(person('acct_first'));
      acting();
      withRows();
      mockPrismaService.monetization.create.mockRejectedValueOnce(
        new Error('db down'),
      );

      await expect(onboard()).rejects.toThrow('db down');
    });

    it('should catch errors from Stripe and wrap in BadRequest AppException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(person('acct_err'));
      acting();
      withRows({
        userId: 'u-1',
        profileId: 'prof-2',
        stripeConnectAccountId: 'acct_err',
      });
      mockStripeService.createAccountLink.mockRejectedValue(
        new Error('Stripe API unreachable'),
      );

      await expect(onboard()).rejects.toThrow('Stripe API unreachable');

      mockStripeService.createAccountLink.mockRejectedValue('String error');
      await expect(onboard()).rejects.toThrow('Failed to connect with Stripe');
    });
  });

  describe('getAccountStatus', () => {
    it('should throw if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(
        service.getAccountStatus('u-none', 'prof-1'),
      ).rejects.toThrow('User not found');
    });

    it('should return disconnected status if user has no stripe account', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: null,
      });

      const res = await service.getAccountStatus('u-1', 'prof-1');
      expect(res).toEqual({
        connected: false,
        ownAccount: false,
        transfersEnabled: false,
        chargesEnabled: false,
      });
    });

    it('should fetch Stripe account, upsert monetization and return active capabilities', async () => {
      accounts.set('u-1', 'acct_active');
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: 'acct_active',
      });
      mockStripeService.getAccount.mockResolvedValue({
        capabilities: { transfers: 'active' },
        charges_enabled: true,
        details_submitted: true,
      });

      const res = await service.getAccountStatus('u-1', 'prof-1');
      expect(res).toEqual({
        connected: true,
        ownAccount: true,
        transfersEnabled: true,
        chargesEnabled: true,
        detailsSubmitted: true,
      });
      // The row holding the account; it has its Profile already.
      expect(mockPrismaService.monetization.update).toHaveBeenCalledWith({
        where: { stripeConnectAccountId: 'acct_active' },
        data: {
          transfersEnabled: true,
          chargesEnabled: true,
          verifiedCompany: false,
        },
      });
    });

    it('should catch Stripe errors and fall back to cached monetization status', async () => {
      accounts.set('u-1', 'acct_err');
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: 'acct_err',
      });
      mockPrismaService.monetization.findUnique.mockResolvedValue({
        stripeConnectAccountId: 'acct_err',
        transfersEnabled: true,
        chargesEnabled: false,
      });
      mockStripeService.getAccount.mockRejectedValue(new Error('Stripe down'));

      const res = await service.getAccountStatus('u-1', 'prof-1');
      expect(res).toEqual({
        connected: true,
        ownAccount: false,
        transfersEnabled: true,
        chargesEnabled: false,
        detailsSubmitted: false,
      });
    });

    it('falls back to the flags last saved, off when none was ever saved, during a Stripe error', async () => {
      accounts.set('u-1', 'acct_err');
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: 'acct_err',
      });
      mockStripeService.getAccount.mockRejectedValue(new Error('Stripe down'));

      const res = await service.getAccountStatus('u-1', 'prof-1');
      expect(res).toEqual({
        connected: true,
        ownAccount: true,
        transfersEnabled: false,
        chargesEnabled: false,
        detailsSubmitted: false,
      });
    });

    it("says a Profile paid into another Profile's account is not paid into its own", async () => {
      accounts.set('u-1', 'acct_first');
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u-1' });
      mockStripeService.getAccount.mockResolvedValue({
        capabilities: { transfers: 'active' },
        charges_enabled: true,
        details_submitted: true,
      });

      const res = await service.getAccountStatus('u-1', 'prof-2');

      expect(res).toEqual(
        expect.objectContaining({ connected: true, ownAccount: false }),
      );
      expect(mockStripeService.getAccount).toHaveBeenCalledWith('acct_first');
    });

    it('shows a Profile its own account while it is still being set up', async () => {
      accounts.set('u-1', 'acct_first');
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u-1' });
      const byPerson =
        mockPrismaService.monetization.findUnique.getMockImplementation()!;
      mockPrismaService.monetization.findUnique.mockImplementation(
        async (args: { where: { profileId?: string } }) =>
          args.where.profileId === 'prof-2'
            ? {
                userId: null,
                profileId: 'prof-2',
                stripeConnectAccountId: 'acct_pending',
                transfersEnabled: false,
                chargesEnabled: false,
              }
            : byPerson(args),
      );
      mockStripeService.getAccount.mockResolvedValue({
        capabilities: { transfers: 'inactive' },
        charges_enabled: false,
        details_submitted: false,
      });

      const res = await service.getAccountStatus('u-1', 'prof-2');

      expect(mockStripeService.getAccount).toHaveBeenCalledWith('acct_pending');
      expect(res).toEqual(
        expect.objectContaining({
          connected: true,
          ownAccount: true,
          transfersEnabled: false,
        }),
      );
    });

    it("reads a Profile's own account, and never places its row with the person", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u-1' });
      mockPrismaService.monetization.findUnique.mockImplementation(
        async ({ where }: { where: { profileId?: string } }) =>
          where.profileId === 'prof-2'
            ? {
                userId: null,
                profileId: 'prof-2',
                stripeConnectAccountId: 'acct_second',
                transfersEnabled: false,
                chargesEnabled: false,
                verifiedCompany: false,
              }
            : null,
      );
      mockStripeService.getAccount.mockResolvedValue({
        capabilities: { transfers: 'active' },
        charges_enabled: true,
        details_submitted: true,
      });

      const res = await service.getAccountStatus('u-1', 'prof-2');

      expect(res).toEqual(
        expect.objectContaining({ connected: true, ownAccount: true }),
      );
      expect(mockStripeService.getAccount).toHaveBeenCalledWith('acct_second');
      expect(mockPrismaService.profile.findMany).not.toHaveBeenCalled();
      expect(mockPrismaService.monetization.update).toHaveBeenCalledWith({
        where: { stripeConnectAccountId: 'acct_second' },
        data: {
          transfersEnabled: true,
          chargesEnabled: true,
          verifiedCompany: false,
        },
      });
    });
  });

  describe('getDashboardLink', () => {
    it('should throw if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(
        service.getDashboardLink('u-none', 'prof-1'),
      ).rejects.toThrow('User not found');
    });

    it('should throw if user has no stripeConnectAccountId', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: null,
      });
      await expect(service.getDashboardLink('u-1', 'prof-1')).rejects.toThrow(
        'Stripe Connect account not set up yet',
      );
    });

    it('should create login link and return url', async () => {
      accounts.set('u-1', 'acct_1');
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: 'acct_1',
      });
      mockStripeService.createLoginLink.mockResolvedValue({
        url: 'https://connect.stripe.com/dash',
      });

      const res = await service.getDashboardLink('u-1', 'prof-1');
      expect(res.url).toBe('https://connect.stripe.com/dash');
      expect(mockStripeService.createLoginLink).toHaveBeenCalledWith('acct_1');
    });
  });

  describe('getConnectPayoutsSummary', () => {
    it('should throw if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(
        service.getConnectPayoutsSummary('u-none', 'prof-1'),
      ).rejects.toThrow('User not found');
    });

    it('should throw if user has no stripe account', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: null,
      });
      await expect(
        service.getConnectPayoutsSummary('u-1', 'prof-1'),
      ).rejects.toThrow('Stripe Connect account not set up yet');
    });

    it('should return mapped balance and payouts including null arrival_date', async () => {
      accounts.set('u-1', 'acct_1');
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: 'acct_1',
      });
      mockStripeService.getConnectBalance.mockResolvedValue({
        available: [{ amount: 5000, currency: 'eur' }],
        pending: [{ amount: 2000, currency: 'eur' }],
      });
      mockStripeService.listConnectPayouts.mockResolvedValue({
        data: [
          {
            id: 'po_1',
            amount: 5000,
            currency: 'eur',
            status: 'paid',
            arrival_date: 1700000000,
            created: 1699990000,
            method: 'standard',
            type: 'bank_account',
          },
          {
            id: 'po_2',
            amount: 2000,
            currency: 'usd',
            status: 'in_transit',
            arrival_date: null,
            created: 1700000000,
            method: 'instant',
            type: 'card',
          },
        ],
      });

      const res = await service.getConnectPayoutsSummary('u-1', 'prof-1');
      expect(res.available).toEqual([{ amountCents: 5000, currency: 'EUR' }]);
      expect(res.pending).toEqual([{ amountCents: 2000, currency: 'EUR' }]);
      expect(res.payouts).toHaveLength(2);
      expect(res.payouts[0].id).toBe('po_1');
      expect(res.payouts[0].arrivalDate).toBe(
        new Date(1700000000 * 1000).toISOString(),
      );
      expect(res.payouts[1].arrivalDate).toBeNull();
    });
  });

  describe('getIncomeStats', () => {
    it('should aggregate income over the past 6 months', async () => {
      const now = new Date();
      const currentMonthKey = now.toISOString().slice(0, 7);
      mockPrismaService.transaction.findMany.mockResolvedValue([
        { amount: 1500, createdAt: now },
        { amount: 500, createdAt: now },
        // Transaction from a month not in the 6-month window (should be ignored by map check)
        { amount: 9999, createdAt: new Date('2000-01-01') },
      ]);

      const res = await service.getIncomeStats('u-1');
      expect(res).toHaveLength(6);
      const currentEntry = res.find((r) => r.month === currentMonthKey);
      expect(currentEntry?.income).toBe(2000);
    });
  });

  describe('getFinancialSummary', () => {
    it('should handle missing sums and unknown transaction types gracefully', async () => {
      mockPrismaService.transaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });

      mockPrismaService.transaction.groupBy.mockResolvedValue([
        { type: 'UNKNOWN_TYPE' as any, _sum: { amount: 1000 } },
        { type: 'DIRECT_POST_UNLOCK', _sum: { amount: null } },
      ]);

      const summary = await service.getFinancialSummary('user-1');

      expect(summary.currentMonthIncome).toBe(0);
      expect(summary.totalTips).toBe(0);
      expect(summary.breakdown.postUnlocks).toBe(0);
    });
  });
  describe('a creator whose person is banned from the whole account', () => {
    beforeEach(() => {
      accounts.set('creator-1', 'acct_creator');
      mockPrismaService.profile.findUnique.mockResolvedValue({
        isAccountBanned: false,
        suspendedUntil: null,
        user: { isActive: false, isRootBanned: true, deletedAt: null },
      });
    });
    const premium = {
      isPremium: true,
      priceCents: 500,
      profileId: 'profile-creator',
      profile: { username: 'ana', user: { id: 'creator-1' } },
    };

    it('sells none of their posts', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        ...premium,
      });

      await expect(
        service.createPostUnlockSession(
          'user-1',
          'profile-buyer',
          'post-1',
          'http://return',
        ),
      ).rejects.toThrow('Creator not found');
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('sells none of their stories', async () => {
      mockPrismaService.story.findUnique.mockResolvedValue({
        id: 's-1',
        ...premium,
      });

      await expect(
        service.createStoryUnlockSession(
          'user-1',
          'profile-buyer',
          's-1',
          'http://return',
        ),
      ).rejects.toThrow('Creator not found');
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('sells none of their messages', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-1',
        isLocked: true,
        priceCents: 500,
        senderId: 'profile-creator',
        sender: { username: 'ana', user: { id: 'creator-1' } },
      });

      await expect(
        service.createMessageUnlockSession('user-1', 'm-1', 'http://return'),
      ).rejects.toThrow('Creator not found');
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });
  });
});
