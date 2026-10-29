import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_FEE_DECIMAL } from '../common/constants/monetization.constants.js';
import { AppException } from '../common/errors/app.exception.js';
import type { StripeService } from '../common/stripe/stripe.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AppGateway } from '../socket/app.gateway.js';
import { LIVE_GIFT_CATALOG } from './gift-catalog.js';
import { LiveGiftService } from './live-gift.service.js';

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
    user: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    liveGift: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
    monetization: {
      upsert: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    profile: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'creator-prof-1',
          accountType: 'CREATOR',
          user: { stripeConnectAccountId: 'acct_creator' },
        },
      ]),
    },
    $transaction: vi.fn((fn) => fn(mockPrismaService)),
  };

  const mockStripeService = {
    createCheckoutSession: vi.fn(),
    cardOnlyPaymentMethods: vi.fn(() => ({
      payment_method_configuration: 'pmc_cardonly',
    })),
  };

  beforeEach(() => {
    service = new LiveGiftService(
      mockPrismaService as unknown as PrismaService,
      mockGateway as unknown as AppGateway,
      mockStripeService as unknown as StripeService,
    );
    vi.clearAllMocks();
    mockServer.to.mockReturnThis();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendGift', () => {
    const liveHost = {
      id: 'stream-1',
      status: 'LIVE',
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

    it('rejects gifting yourself', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue(liveHost);
      await expect(
        service.sendGift('stream-1', 'creator-1', 'crown', 'http://localhost'),
      ).rejects.toThrow(AppException);
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('charges the catalog price and the platform application fee', async () => {
      // The host's Profile holds the account the gift is paid into, ready
      // to receive transfers.
      mockPrismaService.monetization.findUnique.mockResolvedValueOnce({
        userId: null,
        stripeConnectAccountId: 'acct_1',
        transfersEnabled: true,
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
          payment_intent_data: expect.objectContaining({
            application_fee_amount: platformFee,
          }),
        }),
        expect.anything(),
      );
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
          create: expect.objectContaining({
            profileId: 'creator-prof-1',
            stripeConnectAccountId: 'acct_creator',
          }),
        }),
      );
      expect(mockServer.emit).toHaveBeenCalledWith(
        'live:gift',
        expect.objectContaining({ receiverId: 'creator-1' }),
      );
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
