import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_FEE_DECIMAL } from '../common/constants/monetization.constants.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MonetizationService } from './monetization.service.js';

describe('MonetizationService', () => {
  let service: MonetizationService;

  const mockPrismaService = {
    monetization: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    profile: {
      findFirst: vi.fn(),
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
  };

  const mockStripeService = {
    createCheckoutSession: vi.fn(),
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMonetization', () => {
    it('should return monetization and stripe status when record exists', async () => {
      mockPrismaService.monetization.findUnique.mockResolvedValue({
        userId: 'user-1',
        lifetimeEarningsCents: 5000,
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        stripeConnectAccountId: 'acct_123',
      });

      const result = await service.getMonetization('user-1');
      expect(result).toHaveProperty('hasStripeAccount', true);
      expect(result.lifetimeEarningsCents).toBe(5000);
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

      const result = await service.getMonetization('user-2');
      expect(mockPrismaService.monetization.create).toHaveBeenCalledWith({
        data: { userId: 'user-2' },
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
      const priceCents = 1000;
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        isPremium: true,
        priceCents,
        profileId: 'creator-profile',
        profile: {
          user: {
            id: 'creator-1',
            email: 'creator@example.com',
            stripeConnectAccountId: 'acct_1',
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

    it('creates Checkout for story unlock with ADR-0010 20% platform fee', async () => {
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
          },
        }),
        { idempotencyKey: undefined },
      );
    });
  });

  describe('createMessageUnlockSession', () => {
    it('should throw if message is not found or not locked or has no price', async () => {
      mockPrismaService.message.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createMessageUnlockSession('user-1', 'm-1', 'http://return'),
      ).rejects.toThrow('This message is not locked or has no price');

      mockPrismaService.message.findUnique.mockResolvedValueOnce({
        id: 'm-1',
        isLocked: false,
        priceCents: 500,
      });
      await expect(
        service.createMessageUnlockSession('user-1', 'm-1', 'http://return'),
      ).rejects.toThrow('This message is not locked or has no price');
    });

    it('should throw if sender is unlocking own message', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-1',
        isLocked: true,
        priceCents: 500,
        senderId: 'user-1',
      });
      await expect(
        service.createMessageUnlockSession('user-1', 'm-1', 'http://return'),
      ).rejects.toThrow('You cannot unlock your own message');
    });

    it('should throw if message is already unlocked', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-1',
        isLocked: true,
        priceCents: 500,
        senderId: 'creator-1',
      });
      mockPrismaService.messageUnlock.findUnique.mockResolvedValue({
        id: 'mu-1',
      });

      await expect(
        service.createMessageUnlockSession('user-1', 'm-1', 'http://return'),
      ).rejects.toThrow('Message already unlocked');
    });

    it('should throw if creator has no stripe account', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-1',
        isLocked: true,
        priceCents: 500,
        senderId: 'creator-1',
        sender: { id: 'creator-1', stripeConnectAccountId: null },
      });
      mockPrismaService.messageUnlock.findUnique.mockResolvedValue(null);

      await expect(
        service.createMessageUnlockSession('user-1', 'm-1', 'http://return'),
      ).rejects.toThrow('Creator has not setup their Stripe account');
    });

    it('should throw if buyer is not found', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-1',
        isLocked: true,
        priceCents: 500,
        senderId: 'creator-1',
        sender: { id: 'creator-1', stripeConnectAccountId: 'acct_1' },
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

    it('creates Checkout for locked message with 20% platform fee', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-1',
        isLocked: true,
        priceCents: 400,
        senderId: 'creator-1',
        sender: {
          id: 'creator-1',
          email: 'c@c.com',
          stripeConnectAccountId: 'acct_1',
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

      const res = await service.createMessageUnlockSession(
        'u-1',
        'm-1',
        'http://return',
      );

      expect(res.url).toBe('https://checkout.stripe.test/message');
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent_data: {
            application_fee_amount: 80,
            transfer_data: { destination: 'acct_1' },
          },
          metadata: {
            type: 'DIRECT_MESSAGE_UNLOCK',
            messageId: 'm-1',
            creatorId: 'creator-1',
          },
        }),
        { idempotencyKey: undefined },
      );
    });
  });

  describe('createTipSession', () => {
    // Tip minimum (100 cents / €1.00) is hardcoded in createTipSession and is
    // independent of MIN_PPV_PRICE_CENTS (the PPV content price floor).
    const tipCents = 500;

    it('should throw if amount is less than the €1.00 minimum', async () => {
      await expect(
        service.createTipSession(
          'user-1',
          'creator-1',
          99,
          'http://localhost/return',
        ),
      ).rejects.toThrow();
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
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({
          id: 'creator-1',
          stripeConnectAccountId: 'acct_1',
        })
        .mockResolvedValueOnce(null);

      await expect(
        service.createTipSession(
          'sender-not-found',
          'creator-1',
          tipCents,
          'http://localhost/return',
        ),
      ).rejects.toThrow('Sender not found');
    });

    it('creates Checkout with the requested amount and ADR-0010 fee', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({
          id: 'creator-1',
          email: 'creator@example.com',
          stripeConnectAccountId: 'acct_1',
        })
        .mockResolvedValueOnce({
          id: 'fan-1',
          email: 'fan@example.com',
        });
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.test/tip',
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
            postId: 'post-123',
          },
        }),
        { idempotencyKey: 'idemp-tip' },
      );
    });

    it('creates Checkout with omitted postId defaulting to empty string in metadata', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({
          id: 'creator-1',
          email: 'creator@example.com',
          stripeConnectAccountId: 'acct_1',
        })
        .mockResolvedValueOnce({
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
    it('should throw if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(
        service.onboardConnectAccount('u-none', 'http://ret', 'http://ref'),
      ).rejects.toThrow('User not found');
    });

    it('should throw if the account is PERSONAL, not Creator/Business', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'u1@test.com',
        stripeConnectAccountId: null,
      });
      mockPrismaService.profile.findFirst.mockResolvedValue({
        accountType: 'PERSONAL',
      });

      await expect(
        service.onboardConnectAccount('u-1', 'http://ret', 'http://ref'),
      ).rejects.toThrow(
        'Solo las cuentas Creator o Business pueden habilitar el cobro con Stripe.',
      );
      expect(mockStripeService.createExpressAccount).not.toHaveBeenCalled();
    });

    it('should create express account and account link when user has no connect account', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'u1@test.com',
        stripeConnectAccountId: null,
      });
      mockPrismaService.profile.findFirst.mockResolvedValue({
        accountType: 'CREATOR',
      });
      mockStripeService.createExpressAccount.mockResolvedValue({
        id: 'acct_new',
      });
      mockStripeService.createAccountLink.mockResolvedValue({
        url: 'https://connect.stripe.com/onboard',
      });

      const res = await service.onboardConnectAccount(
        'u-1',
        'http://ret',
        'http://ref',
      );
      expect(res.url).toBe('https://connect.stripe.com/onboard');
      expect(mockStripeService.createExpressAccount).toHaveBeenCalledWith(
        'u1@test.com',
      );
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { stripeConnectAccountId: 'acct_new' },
      });
      expect(mockStripeService.createAccountLink).toHaveBeenCalledWith(
        'acct_new',
        'http://ret',
        'http://ref',
      );
    });

    it('should reuse existing accountId if already provisioned', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'u1@test.com',
        stripeConnectAccountId: 'acct_existing',
      });
      mockPrismaService.profile.findFirst.mockResolvedValue({
        accountType: 'CREATOR',
      });
      mockStripeService.createAccountLink.mockResolvedValue({
        url: 'https://connect.stripe.com/onboard',
      });

      const res = await service.onboardConnectAccount(
        'u-1',
        'http://ret',
        'http://ref',
      );
      expect(res.url).toBe('https://connect.stripe.com/onboard');
      expect(mockStripeService.createExpressAccount).not.toHaveBeenCalled();
      expect(mockStripeService.createAccountLink).toHaveBeenCalledWith(
        'acct_existing',
        'http://ret',
        'http://ref',
      );
    });

    it('should catch errors from Stripe and wrap in BadRequest AppException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'u1@test.com',
        stripeConnectAccountId: 'acct_err',
      });
      mockPrismaService.profile.findFirst.mockResolvedValue({
        accountType: 'CREATOR',
      });
      mockStripeService.createAccountLink.mockRejectedValue(
        new Error('Stripe API unreachable'),
      );

      await expect(
        service.onboardConnectAccount('u-1', 'http://ret', 'http://ref'),
      ).rejects.toThrow('Stripe API unreachable');

      mockStripeService.createAccountLink.mockRejectedValue('String error');
      await expect(
        service.onboardConnectAccount('u-1', 'http://ret', 'http://ref'),
      ).rejects.toThrow('Failed to connect with Stripe');
    });
  });

  describe('getAccountStatus', () => {
    it('should throw if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.getAccountStatus('u-none')).rejects.toThrow(
        'User not found',
      );
    });

    it('should return disconnected status if user has no stripe account', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: null,
      });

      const res = await service.getAccountStatus('u-1');
      expect(res).toEqual({
        connected: false,
        transfersEnabled: false,
        chargesEnabled: false,
      });
    });

    it('should fetch Stripe account, upsert monetization and return active capabilities', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: 'acct_active',
      });
      mockPrismaService.monetization.findUnique.mockResolvedValue(null);
      mockStripeService.getAccount.mockResolvedValue({
        capabilities: { transfers: 'active' },
        charges_enabled: true,
        details_submitted: true,
      });

      const res = await service.getAccountStatus('u-1');
      expect(res).toEqual({
        connected: true,
        transfersEnabled: true,
        chargesEnabled: true,
        detailsSubmitted: true,
      });
      expect(mockPrismaService.monetization.upsert).toHaveBeenCalledWith({
        where: { userId: 'u-1' },
        update: { transfersEnabled: true, chargesEnabled: true },
        create: { userId: 'u-1', transfersEnabled: true, chargesEnabled: true },
      });
    });

    it('should catch Stripe errors and fall back to cached monetization status', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: 'acct_err',
      });
      mockPrismaService.monetization.findUnique.mockResolvedValue({
        transfersEnabled: true,
        chargesEnabled: false,
      });
      mockStripeService.getAccount.mockRejectedValue(new Error('Stripe down'));

      const res = await service.getAccountStatus('u-1');
      expect(res).toEqual({
        connected: true,
        transfersEnabled: true,
        chargesEnabled: false,
        detailsSubmitted: false,
      });
    });

    it('should return default falsy cached values if cached record is null during Stripe error', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: 'acct_err',
      });
      mockPrismaService.monetization.findUnique.mockResolvedValue(null);
      mockStripeService.getAccount.mockRejectedValue(new Error('Stripe down'));

      const res = await service.getAccountStatus('u-1');
      expect(res).toEqual({
        connected: true,
        transfersEnabled: false,
        chargesEnabled: false,
        detailsSubmitted: false,
      });
    });
  });

  describe('getDashboardLink', () => {
    it('should throw if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.getDashboardLink('u-none')).rejects.toThrow(
        'User not found',
      );
    });

    it('should throw if user has no stripeConnectAccountId', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: null,
      });
      await expect(service.getDashboardLink('u-1')).rejects.toThrow(
        'Stripe Connect account not set up yet',
      );
    });

    it('should create login link and return url', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: 'acct_1',
      });
      mockStripeService.createLoginLink.mockResolvedValue({
        url: 'https://connect.stripe.com/dash',
      });

      const res = await service.getDashboardLink('u-1');
      expect(res.url).toBe('https://connect.stripe.com/dash');
      expect(mockStripeService.createLoginLink).toHaveBeenCalledWith('acct_1');
    });
  });

  describe('getConnectPayoutsSummary', () => {
    it('should throw if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.getConnectPayoutsSummary('u-none')).rejects.toThrow(
        'User not found',
      );
    });

    it('should throw if user has no stripe account', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        stripeConnectAccountId: null,
      });
      await expect(service.getConnectPayoutsSummary('u-1')).rejects.toThrow(
        'Stripe Connect account not set up yet',
      );
    });

    it('should return mapped balance and payouts including null arrival_date', async () => {
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

      const res = await service.getConnectPayoutsSummary('u-1');
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
});
