import { ErrorCode } from '@circlesfera/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  creatorShareCents,
  PLATFORM_FEE_DECIMAL,
} from '../common/constants/monetization.constants.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SHARE_SQL } from './earnings-sql.js';
import { MonetizationService } from './monetization.service.js';

// Whoever pays here is an adult, unless a test says otherwise; the rule is
// tested on its own (adult-payer.policy.spec.ts).
const adultPayer = vi.hoisted(() => ({
  assertAdultPayer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../common/policies/adult-payer.policy.js', () => adultPayer);

// The SQL text and the values of a raw query the service ran.
// A person verified as an adult, who may charge.
const ADULT = {
  identityVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  dateOfBirth: new Date('1990-05-01T00:00:00.000Z'),
  dateOfBirthVerified: true,
};

function rawQuery(call: unknown[]) {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  const query = Prisma.sql(strings, ...values);
  return { sql: query.text.replace(/\s+/g, ' '), values: query.values };
}

describe('MonetizationService', () => {
  let service: MonetizationService;
  const accounts = new Map<string, string>();
  // Payout accounts that take no card payments yet.
  const notCharging = new Set<string>();

  const mockPrismaService = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (writes: unknown[]) => Promise.all(writes)),
    monetization: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    profile: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'creator-prof-1',
          accountType: 'CREATOR',
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
      // Not waiting for moderation, unless a test says otherwise.
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
    },
    story: {
      // Not waiting for moderation, unless a test says otherwise.
      findFirst: vi.fn().mockResolvedValue(null),
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
    setCreatorWebsite: vi.fn().mockResolvedValue(undefined),
    // The creator's tax settings are complete unless a test says otherwise.
    creatorTaxActive: vi.fn().mockResolvedValue(true),
    createExpressAccount: vi.fn(),
    createAccountLink: vi.fn(),
    getAccount: vi.fn(),
    createLoginLink: vi.fn(),
    getConnectBalance: vi.fn(),
    listConnectPayouts: vi.fn(),
    createTaxDetailsSession: vi.fn(),
    embeddedPanelsPublishableKey: vi.fn(),
    getTaxDetailsStatus: vi.fn(),
  };

  const mockEventEmitter = { emit: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonetizationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StripeService, useValue: mockStripeService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<MonetizationService>(MonetizationService);
    vi.clearAllMocks();
    // A Profile paid is in good standing unless a test says otherwise.
    mockPrismaService.profile.findUnique.mockResolvedValue({
      isAccountBanned: false,
      suspendedUntil: null,
      monetizationStatus: 'APPROVED',
      user: { isActive: true, isRootBanned: false, deletedAt: null, ...ADULT },
    });
    // The rows of earnings: which person holds which payout account.
    accounts.clear();
    notCharging.clear();
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
              // Taking card payments, unless a test says otherwise.
              chargesEnabled: !notCharging.has(account),
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

      mockPrismaService.$queryRaw.mockResolvedValue([{ earned: 1061n }]);

      const result = await service.getMonetization('user-1', 'prof-1');
      expect(result).toHaveProperty('hasStripeAccount', true);
      // What prof-1 earned, not the person's counter (5000).
      expect(result.lifetimeEarningsCents).toBe(1061);
      const { sql, values } = rawQuery(
        mockPrismaService.$queryRaw.mock.calls[0],
      );
      expect(sql).toContain(
        'SUM( COALESCE(( FLOOR(((t.amount - t."vatCents")::numeric * (t.amount - t."refundedCents"))',
      );
      expect(sql).toContain('t."receiverId" = $1');
      expect(sql).toContain("t.status = 'COMPLETED'");
      expect(sql).toContain('t.type::text IN ($2,$3,$4,$5,$6)');
      expect(sql).toContain('t."receiverProfileId" = $7');
      expect(values).toEqual([
        'user-1',
        'DIRECT_POST_UNLOCK',
        'DIRECT_STORY_UNLOCK',
        'DIRECT_MESSAGE_UNLOCK',
        'DIRECT_TIP',
        'DIRECT_LIVE_GIFT',
        'prof-1',
      ]);
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
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.getMonetization('user-2', 'prof-1');
      // The row is placed with the earning Profile and holds no account
      // until one is connected.
      expect(mockPrismaService.monetization.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          profileId: 'creator-prof-1',
        },
      });
      expect(result).toHaveProperty('hasStripeAccount', false);
      expect(result.lifetimeEarningsCents).toBe(0);
    });
  });

  describe("the creator's share in SQL", () => {
    it('rounds the fee down per payment exactly as creatorShareCents', () => {
      // FLOOR(p * 0.2) in exact decimal arithmetic is p divided by 5,
      // rounded down; the app's share must match it for every price.
      expect(PLATFORM_FEE_DECIMAL).toBe(0.2);
      // The price without VAT is first scaled by what was not refunded,
      // rounded down, as keptWithoutVat does.
      const kept =
        'FLOOR(((t.amount - t."vatCents")::numeric * (t.amount - t."refundedCents")) / NULLIF(t.amount, 0))';
      expect(SHARE_SQL.sql.replace(/\s+/g, ' ').trim()).toBe(
        `COALESCE(( ${kept}) - FLOOR(( ${kept}) * 0.2), 0)`,
      );
      for (let price = 0; price <= 100_000; price++) {
        if (creatorShareCents(price) !== price - Math.floor(price / 5)) {
          throw new Error(`share differs at ${price}`);
        }
      }
    });
  });

  describe('getTransactions', () => {
    it('answers only what the history shows, and pages by default', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([
        {
          id: 'paid',
          type: 'TIP',
          amount: 1000,
          vatCents: 174,
          currency: 'EUR',
          status: 'COMPLETED',
          createdAt: new Date(0),
          receiverId: 'u-2',
          receiverProfileId: 'prof-of-u-2',
        },
        {
          id: 'paid-to-gone',
          type: 'TIP',
          amount: 500,
          vatCents: 0,
          currency: 'EUR',
          status: 'COMPLETED',
          createdAt: new Date(0),
          receiverId: null,
          receiverProfileId: null,
        },
      ]);
      mockPrismaService.transaction.count.mockResolvedValue(2);

      const result = await service.getTransactions('user-1', 'prof-1');

      const select = mockPrismaService.transaction.findMany.mock.calls[0][0]
        .select as Record<string, unknown>;
      for (const hidden of [
        'senderId',
        'sender',
        'receiver',
        'stripePaymentIntentId',
        'description',
        'receiverProfile',
      ]) {
        expect(select).not.toHaveProperty(hidden);
      }
      expect(result.data[0]).toEqual({
        id: 'paid',
        type: 'TIP',
        amount: 1000,
        vatCents: 174,
        currency: 'EUR',
        status: 'COMPLETED',
        createdAt: new Date(0),
        incoming: false,
      });
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('lists what the active Profile received and what the person paid', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([
        {
          id: 'received',
          receiverId: 'user-1',
          receiverProfileId: 'prof-1',
        },
        {
          id: 'paid',
          receiverId: 'u-9',
          receiverProfileId: 'prof-9',
        },
      ]);
      mockPrismaService.transaction.count.mockResolvedValue(2);

      const result = await service.getTransactions('user-1', 'prof-1', 2, 5);

      const where = {
        OR: [
          { senderId: 'user-1' },
          { receiverId: 'user-1', receiverProfileId: 'prof-1' },
        ],
      };
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, skip: 5, take: 5 }),
      );
      expect(mockPrismaService.transaction.count).toHaveBeenCalledWith({
        where,
      });
      expect(result.data.map((tx) => [tx.id, tx.incoming])).toEqual([
        ['received', true],
        ['paid', false],
      ]);
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

    it('sells no post moderation hid or removed', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createPostUnlockSession(
          'user-1',
          'profile-1',
          'post-1',
          'http://localhost/return',
        ),
      ).rejects.toThrow();
      expect(mockPrismaService.post.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'post-1',
            // On sale only once automatic moderation passed it.
            moderationStatus: 'VISIBLE',
            moderationPassedAt: { not: null },
          }),
        }),
      );
    });

    it('says a post waiting for automatic moderation is not on sale yet', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.post.findFirst.mockResolvedValueOnce({ id: 'post-1' });

      await expect(
        service.createPostUnlockSession(
          'user-1',
          'profile-1',
          'post-1',
          'http://localhost/return',
        ),
      ).rejects.toMatchObject({ errorCode: ErrorCode.CONTENT_UNDER_REVIEW });
      expect(mockPrismaService.post.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'post-1',
          moderationStatus: 'VISIBLE',
          moderationPassedAt: null,
          archivedAt: null,
        }),
        select: { id: true },
      });
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
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
      ).rejects.toThrow('Creator cannot take payments yet');
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

    it("sells nothing, and asks the provider nothing, while the creator's account takes no card payments", async () => {
      accounts.set('creator-1', 'acct_old');
      notCharging.add('acct_old');
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        isPremium: true,
        priceCents: 1000,
        profileId: 'creator-profile',
        profile: { username: 'ana', user: { id: 'creator-1' } },
      });

      await expect(
        service.createPostUnlockSession(
          'fan-1',
          'fan-profile',
          'post-1',
          'http://localhost/return',
        ),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.CREATOR_STRIPE_NOT_SETUP,
        message: 'Creator cannot take payments yet',
      });
      expect(mockStripeService.creatorTaxActive).not.toHaveBeenCalled();
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
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
          // Charged on the creator's account, VAT included and worked out
          // there; CircleSfera's fee is asked on the whole price and
          // settled once the VAT is known.
          automatic_tax: { enabled: true, liability: { type: 'self' } },
          payment_intent_data: { application_fee_amount: 200 },
        }),
        { stripeAccount: 'acct_1', idempotencyKey: 'idemp-1' },
      );
      expect(mockStripeService.creatorTaxActive).toHaveBeenCalledWith('acct_1');
      // Who pays sees the Profile, never the creator's email.
      const [session] = mockStripeService.createCheckoutSession.mock.calls[0];
      expect(JSON.stringify(session)).toContain('@ana');
      expect(JSON.stringify(session)).not.toContain('creator@example.com');
    });
  });

  describe('createStoryUnlockSession', () => {
    it('sells no story moderation hid or removed', async () => {
      mockPrismaService.story.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createStoryUnlockSession(
          'user-1',
          'prof-1',
          's-1',
          'http://return',
        ),
      ).rejects.toThrow();
      expect(mockPrismaService.story.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 's-1',
            // On sale only once automatic moderation passed it.
            moderationStatus: 'VISIBLE',
            moderationPassedAt: { not: null },
          }),
        }),
      );
    });

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

    it('says a story waiting for automatic moderation is not on sale yet', async () => {
      mockPrismaService.story.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.story.findFirst.mockResolvedValueOnce({
        id: 'story-1',
      });

      await expect(
        service.createStoryUnlockSession(
          'user-1',
          'profile-1',
          'story-1',
          'http://localhost/return',
        ),
      ).rejects.toMatchObject({ errorCode: ErrorCode.CONTENT_UNDER_REVIEW });
      expect(mockPrismaService.story.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'story-1',
          moderationPassedAt: null,
        }),
        select: { id: true },
      });
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
      ).rejects.toThrow('Creator cannot take payments yet');
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
          // Charged on the creator's account, VAT included and worked out
          // there; CircleSfera's fee is asked on the whole price and
          // settled once the VAT is known.
          automatic_tax: { enabled: true, liability: { type: 'self' } },
          payment_intent_data: { application_fee_amount: 120 },
          metadata: {
            type: 'DIRECT_STORY_UNLOCK',
            storyId: 's-1',
            creatorId: 'c-1',
            // The buyer's consent, kept with the payment.
            withdrawal_consent: 'accepted',
            withdrawal_consent_version: '2026-1',
          },
        }),
        { stripeAccount: 'acct_1', idempotencyKey: undefined },
      );
    });
  });

  describe('createMessageUnlockSession', () => {
    // Messages are no longer sold: none is offered to buy, and the provider
    // is never asked.
    it.each([
      ['gone', null, ErrorCode.MESSAGE_NOT_FOUND],
      [
        'deleted by its sender',
        { isDeleted: true, isLocked: true, priceCents: 500 },
        ErrorCode.MESSAGE_NOT_FOUND,
      ],
      [
        'without a price',
        { isDeleted: false, isLocked: false, priceCents: null },
        ErrorCode.NOT_PREMIUM_OR_NO_PRICE,
      ],
      [
        'sent with a price before paid messages ended',
        { isDeleted: false, isLocked: true, priceCents: 500 },
        ErrorCode.PAID_MESSAGES_UNAVAILABLE,
      ],
    ])('sells no message %s', async (_case, message, errorCode) => {
      mockPrismaService.message.findUnique.mockResolvedValue(message);

      await expect(
        service.createMessageUnlockSession('msg-1'),
      ).rejects.toMatchObject({ errorCode });
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
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
      monetizationStatus: 'APPROVED',
      user: { isActive: true, isRootBanned: false, deletedAt: null, ...ADULT },
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
      ).rejects.toThrow('Creator cannot take payments yet');
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

    it('opens no checkout when whoever pays is not an adult', async () => {
      accounts.set('creator-1', 'acct_1');
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'fan-1',
        email: 'fan@example.com',
      });
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        profileId: 'creator-1-profile',
        profile: tippable('creator-1'),
      });
      adultPayer.assertAdultPayer.mockRejectedValueOnce(
        Object.assign(new Error('under age'), { errorCode: 'PAYER_UNDER_AGE' }),
      );

      await expect(
        service.createTipSession(
          'fan-1',
          'creator-1',
          tipCents,
          'http://localhost/return',
          'post-123',
        ),
      ).rejects.toMatchObject({ errorCode: 'PAYER_UNDER_AGE' });
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
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
          // Paid by card only, on the creator's account.
          allowed_payment_method_types: ['card'],
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({ unit_amount: tipCents }),
            }),
          ],
          automatic_tax: { enabled: true, liability: { type: 'self' } },
          payment_intent_data: {
            application_fee_amount: Math.floor(tipCents * PLATFORM_FEE_DECIMAL),
          },
          metadata: {
            type: 'DIRECT_TIP',
            creatorId: 'creator-1',
            // A person was named: no Profile is kept.
            profileId: '',
            senderProfileId: '',
            postId: 'post-123',
          },
        }),
        { stripeAccount: expect.any(String), idempotencyKey: 'idemp-tip' },
      );
      // Whoever pays is an adult with a verified identity.
      expect(adultPayer.assertAdultPayer).toHaveBeenCalledWith(
        expect.anything(),
        'fan-1',
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
      // A post moderation hid or removed is looked for among those shown only.
      expect(mockPrismaService.post.findUnique).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'x',
            // On sale only once automatic moderation passed it.
            moderationStatus: 'VISIBLE',
            moderationPassedAt: { not: null },
          }),
        }),
      );

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
      ...ADULT,
    });
    const acting = (accountType = 'CREATOR', id = 'prof-2') =>
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id,
        accountType,
        username: 'ana.trazos',
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
      // An account opened to take card payments, still being verified.
      mockStripeService.getAccount.mockResolvedValue({
        capabilities: { card_payments: 'inactive', transfers: 'inactive' },
      });
    });

    it('opens no payout account for someone under 18, saying why', async () => {
      withRows();
      acting();
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...person(),
        dateOfBirth: new Date(new Date().getFullYear() - 17, 0, 1),
      });

      await expect(onboard()).rejects.toMatchObject({
        errorCode: ErrorCode.MONETIZATION_UNDER_AGE,
      });
      expect(mockStripeService.createExpressAccount).not.toHaveBeenCalled();
      expect(mockStripeService.createAccountLink).not.toHaveBeenCalled();
    });

    it('opens no payout account for a Profile staff have not approved', async () => {
      withRows();
      acting();
      mockPrismaService.user.findUnique.mockResolvedValue(person());
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        monetizationStatus: 'PENDING',
      });

      await expect(onboard()).rejects.toMatchObject({
        errorCode: ErrorCode.MONETIZATION_NOT_APPROVED,
      });
      expect(mockStripeService.createExpressAccount).not.toHaveBeenCalled();
    });

    describe('an account opened before creators sold on their own account', () => {
      const transferOnly = {
        capabilities: { transfers: 'active' },
        charges_enabled: true,
      };
      const funds = (amount: number) => ({
        available: [{ amount: 0, currency: 'eur' }],
        pending: [{ amount, currency: 'eur' }],
      });
      beforeEach(() => {
        mockPrismaService.user.findUnique.mockResolvedValue(person('acct_old'));
        acting();
        withRows({
          userId: 'u-1',
          profileId: 'prof-2',
          stripeConnectAccountId: 'acct_old',
        });
        mockStripeService.getAccount.mockResolvedValue(transferOnly);
        mockPrismaService.monetization.updateMany.mockResolvedValue({
          count: 1,
        });
      });

      it('is replaced on the row holding it by one that takes card payments, while it holds nothing', async () => {
        mockStripeService.getConnectBalance.mockResolvedValue(funds(0));
        mockStripeService.createExpressAccount.mockResolvedValue({
          id: 'acct_direct',
        });

        await expect(onboard()).resolves.toEqual({
          url: 'https://connect.stripe.com/onboard',
        });

        expect(mockStripeService.getConnectBalance).toHaveBeenCalledWith(
          'acct_old',
        );
        // Keyed on the old account: a repeated request opens no second one.
        expect(mockStripeService.createExpressAccount).toHaveBeenCalledWith(
          'u1@test.com',
          'connect-account-acct_old-direct',
        );
        // The person's own column is no longer written.
        expect(mockPrismaService.user.updateMany).not.toHaveBeenCalled();
        expect(mockPrismaService.monetization.updateMany).toHaveBeenCalledWith({
          where: { stripeConnectAccountId: 'acct_old' },
          data: {
            stripeConnectAccountId: 'acct_direct',
            transfersEnabled: false,
            chargesEnabled: false,
            verifiedCompany: false,
          },
        });
        expect(mockStripeService.createAccountLink).toHaveBeenCalledWith(
          'acct_direct',
          'http://ret',
          'http://ref',
        );
      });

      it('is left to staff, untouched, while it holds money', async () => {
        mockStripeService.getConnectBalance.mockResolvedValue(funds(150));

        await expect(onboard()).rejects.toMatchObject({
          errorCode: ErrorCode.STRIPE_ONBOARDING_FAILED,
          message:
            'Your payout account must be updated by our team before you can sell',
        });

        expect(mockStripeService.createExpressAccount).not.toHaveBeenCalled();
        expect(mockPrismaService.user.updateMany).not.toHaveBeenCalled();
        expect(mockStripeService.createAccountLink).not.toHaveBeenCalled();
        expect(mockEventEmitter.emit).toHaveBeenCalledWith(
          'payment.alert',
          expect.objectContaining({
            eventType: 'Payout Account Replacement Needed',
          }),
        );
      });
    });

    it('keeps an account that takes card payments, or is asking to', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(person('acct_new'));
      acting();
      withRows({
        userId: 'u-1',
        profileId: 'prof-2',
        stripeConnectAccountId: 'acct_new',
      });

      await onboard();

      expect(mockStripeService.getAccount).toHaveBeenCalledWith('acct_new');
      expect(mockStripeService.getConnectBalance).not.toHaveBeenCalled();
      expect(mockStripeService.createAccountLink).toHaveBeenCalledWith(
        'acct_new',
        'http://ret',
        'http://ref',
      );
      // The account carries the address of the creator's page.
      expect(mockStripeService.setCreatorWebsite).toHaveBeenCalledWith(
        'acct_new',
        'ana.trazos',
      );
    });

    it('onboards even when the address of the page cannot be sent', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(person('acct_new'));
      acting();
      withRows({
        userId: 'u-1',
        profileId: 'prof-2',
        stripeConnectAccountId: 'acct_new',
      });
      mockStripeService.setCreatorWebsite.mockRejectedValueOnce(
        new Error('down'),
      );
      await expect(onboard()).resolves.toEqual({
        url: 'https://connect.stripe.com/onboard',
      });

      mockStripeService.setCreatorWebsite.mockRejectedValueOnce('not an error');
      await expect(onboard()).resolves.toBeDefined();
    });

    it('should throw if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(onboard()).rejects.toThrow('User not found');
    });

    it("refuses a Personal Profile, and a Profile that is not the person's", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(person());
      acting('PERSONAL');
      await expect(onboard()).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({
          errorCode: 'ACCOUNT_TYPE_NOT_ELIGIBLE_FOR_MONETIZATION',
        }),
      });

      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      await expect(onboard()).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({
          errorCode: 'ACCOUNT_TYPE_NOT_ELIGIBLE_FOR_MONETIZATION',
        }),
      });
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
      // Kept on the person's row only, never on the person.
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
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

    it("reads no account from the person: a request repeated after the row failed gets the person's account back from the provider", async () => {
      // The person's own column names an account the row lacks.
      mockPrismaService.user.findUnique.mockResolvedValue(
        person('acct_column_only'),
      );
      acting();
      withRows();
      // The provider answers the person's key with the account it opened.
      mockStripeService.createExpressAccount.mockResolvedValue({
        id: 'acct_existing',
      });

      await onboard();

      expect(mockStripeService.createExpressAccount).toHaveBeenCalledWith(
        'u1@test.com',
        'connect-account-u-1',
      );
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
        capabilities: { transfers: 'active', card_payments: 'active' },
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
      notCharging.add('acct_err');
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
        capabilities: { transfers: 'active', card_payments: 'active' },
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
        capabilities: { transfers: 'active', card_payments: 'active' },
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

  describe('createTaxDetailsSession', () => {
    // The Profile's own row, holding the account it set up.
    const ownRow = (profileId: string | null, account: string | null) =>
      mockPrismaService.monetization.findUnique.mockImplementation(
        async ({ where }: { where: { profileId?: string } }) =>
          where.profileId === 'prof-1'
            ? {
                userId: null,
                profileId,
                stripeConnectAccountId: account,
                transfersEnabled: true,
                chargesEnabled: true,
              }
            : null,
      );

    beforeEach(() => {
      mockStripeService.embeddedPanelsPublishableKey.mockReturnValue(
        'pk_test_1',
      );
      mockStripeService.createTaxDetailsSession.mockResolvedValue(
        'accs_secret__abc',
      );
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("opens the session on the Profile's own account, with the key the panels load with", async () => {
      ownRow('prof-1', 'acct_own');

      await expect(
        service.createTaxDetailsSession('u-1', 'prof-1'),
      ).resolves.toEqual({
        clientSecret: 'accs_secret__abc',
        publishableKey: 'pk_test_1',
      });
      expect(mockStripeService.createTaxDetailsSession).toHaveBeenCalledWith(
        'acct_own',
      );
    });

    it("opens it on the person's first account while this Profile holds it", async () => {
      accounts.set('u-1', 'acct_first');

      await service.createTaxDetailsSession('u-1', 'prof-1');

      expect(mockStripeService.createTaxDetailsSession).toHaveBeenCalledWith(
        'acct_first',
      );
    });

    it("refuses a Profile paid into another Profile's account", async () => {
      // The person's first account, held by prof-1, seen from prof-2.
      accounts.set('u-1', 'acct_first');

      await expect(
        service.createTaxDetailsSession('u-1', 'prof-2'),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.STRIPE_CONNECT_NOT_SETUP,
      });
      expect(mockStripeService.createTaxDetailsSession).not.toHaveBeenCalled();
    });

    it('refuses a Profile with no payout account', async () => {
      ownRow('prof-1', null);

      await expect(
        service.createTaxDetailsSession('u-1', 'prof-1'),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.STRIPE_CONNECT_NOT_SETUP,
      });
      expect(mockStripeService.createTaxDetailsSession).not.toHaveBeenCalled();
    });

    it('opens nothing while the publishable key is missing or of the other mode', async () => {
      ownRow('prof-1', 'acct_own');
      mockStripeService.embeddedPanelsPublishableKey.mockReturnValue(null);
      const logged = vi
        .spyOn(
          (service as unknown as { logger: { error: () => void } }).logger,
          'error',
        )
        .mockImplementation(() => {});

      await expect(
        service.createTaxDetailsSession('u-1', 'prof-1'),
      ).rejects.toMatchObject({ status: 503 });
      expect(mockStripeService.createTaxDetailsSession).not.toHaveBeenCalled();
      expect(logged).toHaveBeenCalledTimes(1);
    });

    it('refuses a Test Account where money is real, before asking the provider', async () => {
      vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_x');
      ownRow('prof-1', 'acct_own');
      mockPrismaService.user.findUnique.mockResolvedValue({
        isTestAccount: true,
      });

      await expect(
        service.createTaxDetailsSession('u-1', 'prof-1'),
      ).rejects.toMatchObject({ status: 403 });
      expect(mockStripeService.createTaxDetailsSession).not.toHaveBeenCalled();
    });
  });

  describe('getTaxDetailsStatus', () => {
    const status = {
      headOffice: { city: 'Madrid', country: 'ES' },
      status: 'active',
      registrationCountries: ['ES'],
    };

    beforeEach(() => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        isTestAccount: false,
      });
    });

    it("reads the tax details of the Profile's own account", async () => {
      accounts.set('u-1', 'acct_first');
      mockStripeService.getTaxDetailsStatus.mockResolvedValue(status);

      await expect(
        service.getTaxDetailsStatus('u-1', 'prof-1'),
      ).resolves.toEqual(status);
      expect(mockStripeService.getTaxDetailsStatus).toHaveBeenCalledWith(
        'acct_first',
      );
    });

    it("reads nothing of another Profile's account", async () => {
      accounts.set('u-1', 'acct_first');

      await expect(
        service.getTaxDetailsStatus('u-1', 'prof-2'),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.STRIPE_CONNECT_NOT_SETUP,
      });
      expect(mockStripeService.getTaxDetailsStatus).not.toHaveBeenCalled();
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
        // 15 € paid with 2.60 € of VAT inside, and 5 € with none: the income
        // is the creator's share of what was paid without the VAT
        // (992 + 400).
        { amount: 1500, vatCents: 260, createdAt: now },
        { amount: 500, vatCents: 0, createdAt: now },
        // Transaction from a month not in the 6-month window (should be ignored by map check)
        { amount: 9999, vatCents: 0, createdAt: new Date('2000-01-01') },
      ]);

      const res = await service.getIncomeStats('u-1', 'p-1');
      expect(res).toHaveLength(6);
      const currentEntry = res.find((r) => r.month === currentMonthKey);
      expect(currentEntry?.income).toBe(1392);
      // Only the active Profile's income.
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            receiverId: 'u-1',
            receiverProfileId: 'p-1',
          }),
        }),
      );
    });

    it('counts of a payment refunded in part only what the buyer kept paid', async () => {
      const now = new Date();
      mockPrismaService.transaction.findMany.mockResolvedValue([
        // Half of €10.00 refunded: the share of €4.13 without VAT.
        { amount: 1000, vatCents: 174, refundedCents: 500, createdAt: now },
      ]);

      const res = await service.getIncomeStats('u-1', 'p-1');

      expect(
        res.find((r) => r.month === now.toISOString().slice(0, 7))?.income,
      ).toBe(331);
    });
  });

  describe('getIncomeStats on the last day of a month', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      [
        '2026-10-31T12:00:00Z',
        ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
      ],
      [
        '2026-07-31T12:00:00Z',
        ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'],
      ],
    ])(
      'names six different months, from the first of the oldest, on %s',
      async (today, expected) => {
        vi.useFakeTimers({ now: new Date(today) });
        mockPrismaService.transaction.findMany.mockResolvedValue([]);

        const res = await service.getIncomeStats('u-1', 'p-1');

        expect(res.map((r) => r.month)).toEqual(expected);
        expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              createdAt: { gte: new Date(`${expected[0]}-01T00:00:00Z`) },
            }),
          }),
        );
      },
    );
  });

  describe('getFinancialSummary', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('answers zeros when the Profile has received nothing', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const summary = await service.getFinancialSummary('user-1', 'prof-1');

      expect(summary).toEqual({
        currentMonthIncome: 0,
        totalTips: 0,
        breakdown: {
          postUnlocks: 0,
          storyUnlocks: 0,
          messageUnlocks: 0,
          tips: 0,
          liveGifts: 0,
        },
      });
    });

    it("counts the active Profile's share by kind, and this month from the first in UTC", async () => {
      vi.useFakeTimers({ now: new Date('2026-11-01T00:30:00+01:00') });
      mockPrismaService.$queryRaw.mockResolvedValue([
        { type: 'DIRECT_TIP', earned: 661n, earnedThisMonth: 661n },
        { type: 'DIRECT_POST_UNLOCK', earned: 331n, earnedThisMonth: 0n },
        { type: 'DIRECT_LIVE_GIFT', earned: 1653n, earnedThisMonth: 1653n },
      ]);

      const summary = await service.getFinancialSummary('user-1', 'prof-1');

      expect(summary).toEqual({
        currentMonthIncome: 661 + 1653,
        totalTips: 661,
        breakdown: {
          postUnlocks: 331,
          storyUnlocks: 0,
          messageUnlocks: 0,
          tips: 661,
          liveGifts: 1653,
        },
      });
      const { sql, values } = rawQuery(
        mockPrismaService.$queryRaw.mock.calls[0],
      );
      expect(sql).toContain('FILTER (WHERE t."createdAt" >= $1)');
      expect(sql).toContain('t."receiverProfileId" = $');
      expect(sql).toContain('GROUP BY t.type');
      // Half past midnight in Madrid on 1 November is still 31 October in
      // UTC, so this month is October.
      expect(values[0]).toEqual(new Date('2026-10-01T00:00:00Z'));
      expect(values).toContain('user-1');
      expect(values.at(-1)).toBe('prof-1');
    });
  });

  describe('getPersonTotal', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('sums every Profile of the person, each with its own figures', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-31T12:00:00Z') });
      mockPrismaService.profile.findMany.mockResolvedValue([
        {
          id: 'p-creator',
          username: 'ana',
          avatar: 'a.jpg',
          accountType: 'CREATOR',
        },
        {
          id: 'p-business',
          username: 'ana_shop',
          avatar: null,
          accountType: 'BUSINESS',
        },
        {
          id: 'p-personal',
          username: 'ana_me',
          avatar: null,
          accountType: 'PERSONAL',
        },
      ]);
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          receiverProfileId: 'p-creator',
          earned: 1061n,
          earnedThisMonth: 661n,
        },
        {
          receiverProfileId: 'p-business',
          earned: 1600n,
          earnedThisMonth: 1600n,
        },
        // Income that names none of the person's Profiles: in the total
        // only, this month's part too.
        { receiverProfileId: null, earned: 240n, earnedThisMonth: 0n },
        { receiverProfileId: 'p-gone', earned: 80n, earnedThisMonth: 80n },
      ]);
      mockPrismaService.monetization.findMany.mockResolvedValue([
        { profileId: 'p-business' },
      ]);

      const total = await service.getPersonTotal('user-1');

      expect(mockPrismaService.profile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      const { sql, values } = rawQuery(
        mockPrismaService.$queryRaw.mock.calls[0],
      );
      expect(sql).toContain('GROUP BY t."receiverProfileId"');
      expect(sql).toContain('t."receiverId" = $2');
      expect(sql).not.toContain('t."receiverProfileId" =');
      expect(values[0]).toEqual(new Date('2026-10-01T00:00:00Z'));
      expect(values[1]).toBe('user-1');
      expect(mockPrismaService.monetization.findMany).toHaveBeenCalledWith({
        where: {
          profile: { userId: 'user-1' },
          stripeConnectAccountId: { not: null },
        },
        select: { profileId: true },
      });
      expect(total).toEqual({
        totalEarningsCents: 1061 + 1600 + 240 + 80,
        currentMonthEarningsCents: 661 + 1600 + 80,
        unassignedEarningsCents: 240 + 80,
        unassignedCurrentMonthEarningsCents: 80,
        profiles: [
          {
            profileId: 'p-creator',
            username: 'ana',
            avatar: 'a.jpg',
            accountType: 'CREATOR',
            ownPayoutAccount: false,
            earningsCents: 1061,
            currentMonthEarningsCents: 661,
          },
          {
            profileId: 'p-business',
            username: 'ana_shop',
            avatar: null,
            accountType: 'BUSINESS',
            ownPayoutAccount: true,
            earningsCents: 1600,
            currentMonthEarningsCents: 1600,
          },
          {
            profileId: 'p-personal',
            username: 'ana_me',
            avatar: null,
            accountType: 'PERSONAL',
            ownPayoutAccount: false,
            earningsCents: 0,
            currentMonthEarningsCents: 0,
          },
        ],
      });
    });
  });

  describe('a creator whose person is banned from the whole account', () => {
    beforeEach(() => {
      accounts.set('creator-1', 'acct_creator');
      mockPrismaService.profile.findUnique.mockResolvedValue({
        isAccountBanned: false,
        suspendedUntil: null,
        monetizationStatus: 'APPROVED',
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
  });
});
