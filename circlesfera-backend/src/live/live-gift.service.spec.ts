import { ErrorCode } from '@circlesfera/shared';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_FEE_DECIMAL } from '../common/constants/monetization.constants.js';
import { AppException } from '../common/errors/app.exception.js';
import type { StripeService } from '../common/stripe/stripe.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AppGateway } from '../socket/app.gateway.js';
import { LIVE_GIFT_CATALOG } from './gift-catalog.js';
import { LiveGiftService } from './live-gift.service.js';

// A person verified as an adult, who may charge.
const ADULT = {
  identityVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  dateOfBirth: new Date('1990-05-01T00:00:00.000Z'),
  dateOfBirthVerified: true,
};

const PAYABLE = {
  isAccountBanned: false,
  suspendedUntil: null,
  monetizationStatus: 'APPROVED',
  user: { isActive: true, isRootBanned: false, deletedAt: null, ...ADULT },
};

describe('LiveGiftService', () => {
  let service: LiveGiftService;

  const mockServer = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  };

  const mockGateway = {
    server: mockServer,
  };

  const mockPrismaService = {
    liveStream: {
      findUnique: vi.fn(),
    },
    closeFriend: { findUnique: vi.fn().mockResolvedValue(null) },
    // The sender is no guest of the live.
    liveGuest: { findMany: vi.fn().mockResolvedValue([]) },
    block: { findFirst: vi.fn().mockResolvedValue(null) },
    user: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(1),
    tipReservation: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: null } }),
    },
    liveGift: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: null } }),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      // Nothing given yet this week, unless a test says otherwise.
      aggregate: vi
        .fn()
        .mockResolvedValue({ _sum: { amount: null, refundedCents: null } }),
    },
    monetization: {
      upsert: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    profile: {
      // The host may be paid: neither they nor their person is banned.
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'creator-prof-1',
          accountType: 'CREATOR',
        },
      ]),
    },
    $transaction: vi.fn((fn) => fn(mockPrismaService)),
  };

  const mockStripeService = {
    createCheckoutSession: vi.fn(),
    creatorTaxActive: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    service = new LiveGiftService(
      mockPrismaService as unknown as PrismaService,
      mockGateway as unknown as AppGateway,
      mockStripeService as unknown as StripeService,
    );
    vi.clearAllMocks();
    mockPrismaService.profile.findUnique.mockResolvedValue(PAYABLE);
    mockServer.to.mockReturnThis();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendGift', () => {
    const liveHost = {
      id: 'stream-1',
      status: 'LIVE',
      audience: 'EVERYONE',
      hostId: 'host-profile-1',
      host: {
        id: 'host-profile-1',
        userId: 'creator-1',
        username: 'host_user',
        user: { email: 'host@example.com' },
      },
    };

    it('rejects unknown giftId without calling Stripe', async () => {
      await expect(
        service.sendGift('stream-1', 'fan-1', 'not-a-gift', 'http://localhost'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('takes no gift for a live the sender may not watch, as if it were not on', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'fan-1',
        email: 'fan@example.com',
        isTestAccount: false,
      });
      for (const audience of ['PRACTICE', 'CLOSE_FRIENDS']) {
        mockPrismaService.liveStream.findUnique.mockResolvedValue({
          ...liveHost,
          audience,
        });
        await expect(
          service.sendGift(
            'stream-1',
            'fan-1',
            'crown',
            'http://localhost',
            undefined,
            'fan-profile',
          ),
        ).rejects.toThrow('Live stream not active');
      }
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('rejects gifting yourself', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue(liveHost);
      await expect(
        service.sendGift('stream-1', 'creator-1', 'crown', 'http://localhost'),
      ).rejects.toThrow(AppException);
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('takes no gift for a host whose person is banned from the whole account', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue(liveHost);
      mockPrismaService.profile.findUnique.mockResolvedValue({
        ...PAYABLE,
        user: { isActive: false, isRootBanned: true, deletedAt: null },
      });

      await expect(
        service.sendGift('stream-1', 'fan-1', 'crown', 'http://localhost/live'),
      ).rejects.toThrow('Creator not found');
      expect(mockPrismaService.liveGift.create).not.toHaveBeenCalled();
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it("takes no gift, and asks the provider nothing, while the host's account takes no card payments", async () => {
      mockPrismaService.monetization.findUnique.mockResolvedValueOnce({
        userId: null,
        stripeConnectAccountId: 'acct_old',
        transfersEnabled: true,
        chargesEnabled: false,
      });
      mockPrismaService.liveStream.findUnique.mockResolvedValue(liveHost);

      await expect(
        service.sendGift('stream-1', 'fan-1', 'crown', 'http://localhost/live'),
      ).rejects.toThrow('Creator cannot take payments yet');
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('takes no gift that would go over what one person gives in a week, tips included', async () => {
      mockPrismaService.monetization.findUnique.mockResolvedValueOnce({
        userId: null,
        stripeConnectAccountId: 'acct_1',
        transfersEnabled: true,
        chargesEnabled: true,
      });
      mockPrismaService.liveStream.findUnique.mockResolvedValue(liveHost);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'fan-1',
        email: 'fan@example.com',
        profiles: [{ username: 'fan' }],
      });
      // 495 € given this week: a 10 € crown does not fit.
      mockPrismaService.transaction.aggregate.mockResolvedValueOnce({
        _sum: { amount: 49500, refundedCents: 0 },
      });

      await expect(
        service.sendGift('stream-1', 'fan-1', 'crown', 'http://localhost/live'),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.WEEKLY_SUPPORT_LIMIT_REACHED,
      });
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
      expect(mockPrismaService.liveGift.create).not.toHaveBeenCalled();
    });

    it('charges the catalog price and the platform application fee', async () => {
      // The host's Profile holds the account the gift is paid into, ready
      // to receive transfers.
      mockPrismaService.monetization.findUnique.mockResolvedValueOnce({
        userId: null,
        stripeConnectAccountId: 'acct_1',
        transfersEnabled: true,
        chargesEnabled: true,
      });
      mockPrismaService.liveStream.findUnique.mockResolvedValue(liveHost);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'fan-1',
        email: 'fan@example.com',
        profiles: [{ username: 'fan' }],
      });
      mockPrismaService.liveGift.create.mockResolvedValue({ id: 'gift-1' });
      mockPrismaService.liveGift.update.mockResolvedValue({});
      mockStripeService.createCheckoutSession.mockResolvedValue({
        id: 'cs_gift',
        url: 'https://checkout.stripe.test/gift',
      });

      const giftId = 'crown';
      const amountCents = LIVE_GIFT_CATALOG[giftId].amountCents;
      const platformFee = Math.floor(amountCents * PLATFORM_FEE_DECIMAL);

      const result = await service.sendGift(
        'stream-1',
        'fan-1',
        giftId,
        'http://localhost/live',
      );

      expect(result.amountCents).toBe(amountCents);
      expect(result.url).toBe('https://checkout.stripe.test/gift');
      // The checkout closes when the gift stops holding its amount.
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ expires_at: expect.any(Number) }),
        expect.anything(),
      );
      expect(mockPrismaService.$executeRaw).toHaveBeenCalled();
      expect(mockPrismaService.liveGift.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            giftId,
            amountCents,
            status: 'PENDING',
          }),
        }),
      );
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                unit_amount: amountCents,
                product_data: expect.objectContaining({
                  name: `Live Gift: ${LIVE_GIFT_CATALOG[giftId].names.en}`,
                }),
              }),
            }),
          ],
          allowed_payment_method_types: ['card'],
          automatic_tax: { enabled: true, liability: { type: 'self' } },
          payment_intent_data: { application_fee_amount: platformFee },
        }),
        expect.objectContaining({ stripeAccount: 'acct_1' }),
      );
    });
    it('lets the gift go, holding nothing of the weekly limit, when no checkout opens', async () => {
      mockPrismaService.monetization.findUnique.mockResolvedValueOnce({
        userId: null,
        stripeConnectAccountId: 'acct_1',
        transfersEnabled: true,
        chargesEnabled: true,
      });
      mockPrismaService.liveStream.findUnique.mockResolvedValue(liveHost);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'fan-1',
        email: 'fan@example.com',
        profiles: [{ username: 'fan' }],
      });
      mockPrismaService.liveGift.create.mockResolvedValue({ id: 'gift-1' });
      // For example, staff paused new payments.
      const paused = new Error('payments paused');
      mockStripeService.createCheckoutSession.mockRejectedValueOnce(paused);

      await expect(
        service.sendGift('stream-1', 'fan-1', 'crown', 'http://localhost/live'),
      ).rejects.toBe(paused);

      expect(mockPrismaService.liveGift.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'gift-1',
          status: 'PENDING',
          stripeCheckoutSessionId: null,
        },
        data: { status: 'FAILED' },
      });
      expect(mockPrismaService.liveGift.update).not.toHaveBeenCalled();
    });
  });

  describe('completeGiftPayment', () => {
    const params = {
      liveGiftId: 'gift-1',
      senderId: 'fan-1',
      streamId: 'stream-1',
      giftId: 'crown',
      creatorId: 'creator-1',
      amountCents: 500,
      currency: 'eur',
      paymentIntentId: 'pi_123',
    };

    beforeEach(() => {
      // The broadcast's host: the Profile host-profile-1 of the person
      // creator-1.
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        hostId: 'host-profile-1',
      });
    });

    it("records the host's person and Profile from the broadcast, not from the checkout", async () => {
      // A checkout opened before the fix named the host's Profile as creatorId.
      mockPrismaService.liveGift.findUnique.mockResolvedValue({
        id: 'gift-1',
        status: 'PENDING',
        receiverId: 'creator-1',
        sender: { profiles: [{ username: 'fan', avatar: null }] },
      });
      mockPrismaService.user.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve(
            ['fan-1', 'creator-1'].includes(where.id) ? { id: where.id } : null,
          ),
      );
      mockPrismaService.transaction.create.mockResolvedValue({ id: 'tx-1' });
      mockPrismaService.liveGift.update.mockResolvedValue({ id: 'gift-1' });

      await service.completeGiftPayment({
        ...params,
        creatorId: 'host-profile-1',
      });

      expect(mockPrismaService.liveStream.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'stream-1' } }),
      );
      expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            receiverId: 'creator-1',
            receiverProfileId: 'host-profile-1',
          }),
        }),
      );
      expect(mockPrismaService.monetization.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'creator-1' },
          // The row is placed with the host's Profile; its account is only
          // ever written by connecting.
          create: {
            userId: 'creator-1',
            profileId: 'creator-prof-1',
          },
        }),
      );
      expect(mockServer.emit).toHaveBeenCalledWith(
        'live:gift',
        expect.objectContaining({ receiverId: 'creator-1' }),
      );
      mockPrismaService.user.findUnique.mockReset();
    });

    it('records the VAT apart and earns the host their share of what was paid without it', async () => {
      mockPrismaService.liveGift.findUnique.mockResolvedValue({
        id: 'gift-1',
        status: 'PENDING',
        receiverId: 'creator-1',
        sender: { profiles: [{ username: 'fan', avatar: null }] },
      });
      mockPrismaService.user.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve({ id: where.id }),
      );
      mockPrismaService.transaction.create.mockResolvedValue({ id: 'tx-1' });
      mockPrismaService.liveGift.update.mockResolvedValue({ id: 'gift-1' });

      // 10 € paid, 1.74 € of it VAT: the host earns 80% of the 8.26 € left.
      await service.completeGiftPayment({
        ...params,
        amountCents: 1000,
        vatCents: 174,
      });

      expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 1000, vatCents: 174 }),
        }),
      );
      // The host's share is read from this payment; the payout row keeps no
      // counter of it.
      const [{ update, create }] =
        mockPrismaService.monetization.upsert.mock.calls[0];
      expect(update).not.toHaveProperty('lifetimeEarningsCents');
      expect(create).not.toHaveProperty('lifetimeEarningsCents');
      mockPrismaService.user.findUnique.mockReset();
    });

    it('is a no-op when the LiveGift record is not found', async () => {
      mockPrismaService.liveGift.findUnique.mockResolvedValue(null);

      await service.completeGiftPayment(params);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    it('is idempotent when already COMPLETED', async () => {
      mockPrismaService.liveGift.findUnique.mockResolvedValue({
        id: 'gift-1',
        status: 'COMPLETED',
      });

      await service.completeGiftPayment(params);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    it('persists the ledger, credits creator earnings, and broadcasts to the live room', async () => {
      mockPrismaService.liveGift.findUnique.mockResolvedValue({
        id: 'gift-1',
        status: 'PENDING',
        receiverId: 'creator-1',
        sender: { profiles: [{ username: 'fan', avatar: null }] },
      });
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({ id: 'fan-1' })
        .mockResolvedValueOnce({ id: 'creator-1' });
      mockPrismaService.transaction.create.mockResolvedValue({ id: 'tx-1' });
      mockPrismaService.liveGift.update.mockResolvedValue({ id: 'gift-1' });
      mockPrismaService.monetization.upsert.mockResolvedValue({});

      await service.completeGiftPayment(params);

      expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'DIRECT_LIVE_GIFT',
            amount: 500,
            senderId: 'fan-1',
            receiverId: 'creator-1',
          }),
        }),
      );
      expect(mockPrismaService.monetization.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'creator-1' } }),
      );
      expect(mockServer.to).toHaveBeenCalledWith('live:stream-1');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'live:gift',
        expect.objectContaining({
          streamId: 'stream-1',
          giftId: 'crown',
          amountCents: 500,
          senderUsername: 'fan',
        }),
      );
    });

    it('broadcasts with an undefined sender username/avatar when the sender account was hard-deleted (senderId SetNull)', async () => {
      mockPrismaService.liveGift.findUnique.mockResolvedValue({
        id: 'gift-1',
        status: 'PENDING',
        receiverId: 'creator-1',
        sender: null,
      });
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'creator-1' });
      mockPrismaService.transaction.create.mockResolvedValue({ id: 'tx-1' });
      mockPrismaService.liveGift.update.mockResolvedValue({ id: 'gift-1' });
      mockPrismaService.monetization.upsert.mockResolvedValue({});

      await service.completeGiftPayment(params);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'live:gift',
        expect.objectContaining({
          senderUsername: undefined,
          senderAvatar: undefined,
        }),
      );
    });

    it('writes a null senderId on the Transaction when the sender no longer exists, without blocking creator credit', async () => {
      mockPrismaService.liveGift.findUnique.mockResolvedValue({
        id: 'gift-1',
        status: 'PENDING',
        receiverId: 'creator-1',
        sender: null,
      });
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(null) // sender: hard-deleted
        .mockResolvedValueOnce({ id: 'creator-1' });
      mockPrismaService.transaction.create.mockResolvedValue({ id: 'tx-1' });
      mockPrismaService.liveGift.update.mockResolvedValue({ id: 'gift-1' });
      mockPrismaService.monetization.upsert.mockResolvedValue({});

      await service.completeGiftPayment(params);

      expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderId: null,
            receiverId: 'creator-1',
          }),
        }),
      );
      expect(mockPrismaService.monetization.upsert).toHaveBeenCalled();
    });

    it('keeps the gift, without its broadcast, when the host Profile was erased since', async () => {
      mockPrismaService.liveGift.findUnique.mockResolvedValue({
        id: 'gift-1',
        status: 'PENDING',
        receiverId: 'creator-1',
        sender: { profiles: [{ username: 'fan', avatar: null }] },
      });
      // An erased Profile takes its broadcasts along; its person remains.
      mockPrismaService.liveStream.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({ id: 'fan-1' })
        .mockResolvedValueOnce({ id: 'creator-1' });
      mockPrismaService.transaction.create.mockResolvedValue({ id: 'tx-1' });
      mockPrismaService.liveGift.update.mockResolvedValue({ id: 'gift-1' });

      await service.completeGiftPayment(params);

      expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            receiverId: 'creator-1',
            receiverProfileId: null,
            liveStreamId: null,
          }),
        }),
      );
      expect(mockPrismaService.monetization.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'creator-1' } }),
      );
    });

    it('writes a null receiverId and skips crediting earnings when the host was erased', async () => {
      mockPrismaService.liveGift.findUnique.mockResolvedValue({
        id: 'gift-1',
        status: 'PENDING',
        // The gift loses its receiver when the person is erased.
        receiverId: null,
        sender: { profiles: [{ username: 'fan', avatar: null }] },
      });
      mockPrismaService.liveStream.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 'fan-1' });
      mockPrismaService.transaction.create.mockResolvedValue({ id: 'tx-1' });
      mockPrismaService.liveGift.update.mockResolvedValue({ id: 'gift-1' });

      await service.completeGiftPayment(params);

      expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderId: 'fan-1',
            receiverId: null,
            receiverProfileId: null,
            liveStreamId: null,
          }),
        }),
      );
      expect(mockPrismaService.monetization.upsert).not.toHaveBeenCalled();
    });
  });

  describe('handleLiveGiftPayment', () => {
    it('delegates to completeGiftPayment', async () => {
      const spy = vi
        .spyOn(service, 'completeGiftPayment')
        .mockResolvedValue(undefined);
      const payload = {
        liveGiftId: 'gift-1',
        senderId: 'fan-1',
        streamId: 'stream-1',
        giftId: 'crown',
        creatorId: 'creator-1',
        amountCents: 500,
        currency: 'eur',
        paymentIntentId: 'pi_123',
      };

      await service.handleLiveGiftPayment(payload);

      expect(spy).toHaveBeenCalledWith(payload);
    });
  });
});
