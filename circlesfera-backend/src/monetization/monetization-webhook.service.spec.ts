import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CREATOR_SHARE_DECIMAL } from '../common/constants/monetization.constants.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MonetizationWebhookService } from './monetization-webhook.service.js';

describe('MonetizationWebhookService', () => {
  let service: MonetizationWebhookService;
  let prisma: any;
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };
  // The payment provider is replaced: nothing here reaches it.
  let stripe: {
    refundDestinationCharge: ReturnType<typeof vi.fn>;
    takeVatBackFromCreator: ReturnType<typeof vi.fn>;
    getAccount: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    stripe = {
      refundDestinationCharge: vi.fn().mockResolvedValue({}),
      takeVatBackFromCreator: vi.fn().mockResolvedValue(undefined),
      getAccount: vi.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonetizationWebhookService,
        { provide: StripeService, useValue: stripe },
        {
          provide: PrismaService,
          useValue: {
            postUnlock: { upsert: vi.fn(), deleteMany: vi.fn() },
            storyUnlock: { upsert: vi.fn(), deleteMany: vi.fn() },
            messageUnlock: { upsert: vi.fn(), deleteMany: vi.fn() },
            // What was paid for, by the Profile creator-prof-1 of the
            // person creator1.
            message: {
              findUnique: vi
                .fn()
                .mockResolvedValue({ id: 'msg1', senderId: 'creator-prof-1' }),
            },
            post: {
              findUnique: vi
                .fn()
                .mockResolvedValue({ profileId: 'creator-prof-1' }),
            },
            story: {
              findUnique: vi
                .fn()
                .mockResolvedValue({ profileId: 'creator-prof-1' }),
            },
            transaction: {
              create: vi.fn(),
              findUnique: vi.fn(),
              update: vi.fn(),
            },
            monetization: {
              upsert: vi.fn(),
              update: vi.fn(),
              findUnique: vi.fn().mockResolvedValue(null),
            },
            stripePayoutLog: { upsert: vi.fn() },
            promotion: { update: vi.fn(), updateMany: vi.fn() },
            user: { findFirst: vi.fn(), findUnique: vi.fn() },
            profile: {
              findFirst: vi.fn(),
              findMany: vi.fn().mockResolvedValue([
                {
                  id: 'creator-prof-1',
                  accountType: 'CREATOR',
                  user: { stripeConnectAccountId: 'acct_creator' },
                },
              ]),
            },
            $transaction: vi.fn((callback) => callback(prisma)),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<MonetizationWebhookService>(
      MonetizationWebhookService,
    );
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleCheckoutSessionCompleted', () => {
    it('processes a PROMOTION checkout', async () => {
      const session = {
        id: 'cs_promo_1',
        amount_total: 5000,
        currency: 'eur',
        metadata: {
          type: 'PROMOTION',
          promotionId: 'promo_test_id',
          userId: 'user_promo',
        },
      } as any;

      await service.handleCheckoutSessionCompleted(session);

      expect(prisma.promotion.update).toHaveBeenCalledWith({
        where: { id: 'promo_test_id' },
        data: { status: 'ACTIVE', chargedAt: expect.any(Date) },
      });
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'PROMOTION_PAYMENT',
          promotionId: 'promo_test_id',
        }),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.alert',
        expect.objectContaining({ eventType: 'Promotion Payment' }),
      );
    });

    it('throws BadRequest when PROMOTION metadata lacks promotionId', async () => {
      const session = {
        id: 'cs_promo_err',
        metadata: { type: 'PROMOTION' },
      } as any;

      await expect(
        service.handleCheckoutSessionCompleted(session),
      ).rejects.toThrow('PROMOTION checkout missing promotionId');
    });

    it('leaves a connected account with the Profile holding it when a payment is credited', async () => {
      // The account was connected from a Profile that has switched to
      // Personal since: the earnings are credited, the row is not moved.
      prisma.monetization.findUnique.mockResolvedValueOnce({
        profileId: 'was-creator-prof',
        stripeConnectAccountId: 'acct_creator',
      });

      await service.handleCheckoutSessionCompleted({
        id: 'cs_unlock_held',
        client_reference_id: 'buyer1',
        amount_total: 1000,
        currency: 'eur',
        payment_intent: 'pi_held',
        metadata: {
          type: 'DIRECT_POST_UNLOCK',
          postId: 'post1',
          creatorId: 'creator1',
        },
      } as any);

      expect(prisma.monetization.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'creator1' },
          update: {
            lifetimeEarningsCents: {
              increment: Math.floor(1000 * CREATOR_SHARE_DECIMAL),
            },
          },
        }),
      );
    });

    it('processes a DIRECT_POST_UNLOCK checkout', async () => {
      const grossCents = 1000;
      const creatorShareCents = Math.floor(grossCents * CREATOR_SHARE_DECIMAL);
      const session = {
        id: 'cs_unlock_1',
        client_reference_id: 'buyer1',
        amount_total: grossCents,
        currency: 'eur',
        payment_intent: 'pi_12345',
        metadata: {
          type: 'DIRECT_POST_UNLOCK',
          postId: 'post1',
          creatorId: 'creator1',
        },
      } as any;

      await service.handleCheckoutSessionCompleted(session);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.postUnlock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_postId: { userId: 'buyer1', postId: 'post1' } },
        }),
      );
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'DIRECT_POST_UNLOCK',
            senderId: 'buyer1',
            receiverId: 'creator1',
            receiverProfileId: 'creator-prof-1',
            postId: 'post1',
          }),
        }),
      );
      expect(prisma.monetization.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'creator1' },
          // A row without a connected account is placed again too.
          update: {
            profileId: 'creator-prof-1',
            stripeConnectAccountId: 'acct_creator',
            lifetimeEarningsCents: { increment: creatorShareCents },
          },
          // A new row is kept with the Profile holding the person's
          // payout account, and the account.
          create: {
            userId: 'creator1',
            profileId: 'creator-prof-1',
            stripeConnectAccountId: 'acct_creator',
            lifetimeEarningsCents: creatorShareCents,
          },
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.alert',
        expect.objectContaining({ eventType: 'Post Unlock' }),
      );
    });

    // 10 € paid, 1.74 € of it VAT: the creator earns 80% of the 8.26 €
    // left, 6.61 €. They were sent 80% of the 10 €, 8 €, so 1.39 € is taken
    // back before the payment is recorded.
    it.each([
      ['DIRECT_POST_UNLOCK', { postId: 'post1' }],
      ['DIRECT_STORY_UNLOCK', { storyId: 'story1' }],
      ['DIRECT_MESSAGE_UNLOCK', { messageId: 'msg1' }],
      ['DIRECT_TIP', { postId: 'post1' }],
    ])(
      'records a %s at what was paid, the VAT inside it apart, and earns the creator their share of the rest',
      async (type, ids) => {
        await service.handleCheckoutSessionCompleted({
          id: `cs_vat_${type}`,
          client_reference_id: 'buyer1',
          amount_subtotal: 1000,
          amount_total: 1000,
          total_details: { amount_tax: 174 },
          currency: 'eur',
          payment_intent: `pi_vat_${type}`,
          metadata: { type, creatorId: 'creator1', ...ids },
        } as any);

        expect(stripe.takeVatBackFromCreator).toHaveBeenCalledWith({
          paymentIntentId: `pi_vat_${type}`,
          amountInCents: 139,
        });
        expect(
          stripe.takeVatBackFromCreator.mock.invocationCallOrder[0],
        ).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0]);
        expect(prisma.transaction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              type,
              amount: 1000,
              vatCents: 174,
            }),
          }),
        );
        expect(prisma.monetization.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: expect.objectContaining({
              lifetimeEarningsCents: { increment: 661 },
            }),
            create: expect.objectContaining({ lifetimeEarningsCents: 661 }),
          }),
        );
      },
    );

    it('records nothing when the VAT cannot be taken back, so the notice is tried again', async () => {
      stripe.takeVatBackFromCreator.mockRejectedValueOnce(new Error('down'));

      await expect(
        service.handleCheckoutSessionCompleted({
          id: 'cs_vat_fail',
          client_reference_id: 'buyer1',
          amount_total: 1000,
          total_details: { amount_tax: 174 },
          currency: 'eur',
          payment_intent: 'pi_vat_fail',
          metadata: {
            type: 'DIRECT_POST_UNLOCK',
            postId: 'post1',
            creatorId: 'creator1',
          },
        } as any),
      ).rejects.toThrow('down');
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('takes nothing back from a payment with no VAT inside, from a buyer outside the EU', async () => {
      await service.handleCheckoutSessionCompleted({
        id: 'cs_no_vat',
        client_reference_id: 'buyer1',
        amount_total: 1000,
        total_details: { amount_tax: 0 },
        currency: 'eur',
        payment_intent: 'pi_no_vat',
        metadata: {
          type: 'DIRECT_POST_UNLOCK',
          postId: 'post1',
          creatorId: 'creator1',
        },
      } as any);

      expect(stripe.takeVatBackFromCreator).not.toHaveBeenCalled();
      expect(prisma.monetization.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ lifetimeEarningsCents: 800 }),
        }),
      );
    });

    it('hands a live gift on at what was paid, with the VAT inside it apart', async () => {
      await service.handleCheckoutSessionCompleted({
        id: 'cs_vat_gift',
        client_reference_id: 'buyer1',
        amount_total: 1000,
        total_details: { amount_tax: 174 },
        currency: 'eur',
        payment_intent: 'pi_vat_gift',
        metadata: {
          type: 'DIRECT_LIVE_GIFT',
          liveGiftId: 'lg1',
          streamId: 's1',
          giftId: 'star',
          creatorId: 'creator1',
        },
      } as any);

      expect(stripe.takeVatBackFromCreator).toHaveBeenCalledWith({
        paymentIntentId: 'pi_vat_gift',
        amountInCents: 139,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.live_gift_completed',
        expect.objectContaining({ amountCents: 1000, vatCents: 174 }),
      );
    });

    it('processes a DIRECT_TIP checkout and notifies the creator', async () => {
      const session = {
        id: 'cs_tip_1',
        client_reference_id: 'tipper1',
        amount_total: 500,
        currency: 'eur',
        payment_intent: 'pi_tip_123',
        metadata: {
          type: 'DIRECT_TIP',
          creatorId: 'creator2',
          postId: 'post2',
        },
      } as any;

      prisma.profile.findFirst = vi
        .fn()
        .mockResolvedValueOnce({ id: 'creator-profile-2' })
        .mockResolvedValueOnce({ id: 'tipper-profile-1' });

      await service.handleCheckoutSessionCompleted(session);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'DIRECT_TIP',
            senderId: 'tipper1',
            receiverId: 'creator2',
          }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'creator-profile-2',
          senderId: 'tipper-profile-1',
          type: 'PAYMENT',
        }),
      );
    });

    it('keeps the Profile tipped, and tells it as from the Profile that tipped', async () => {
      const session = {
        id: 'cs_tip_2',
        client_reference_id: 'tipper1',
        amount_total: 500,
        currency: 'eur',
        payment_intent: 'pi_tip_456',
        metadata: {
          type: 'DIRECT_TIP',
          creatorId: 'creator2',
          profileId: 'creator-hobby',
          senderProfileId: 'tipper-hobby',
          postId: '',
        },
      } as any;
      prisma.profile.findFirst = vi.fn();
      prisma.profile.findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'creator-hobby' });

      await service.handleCheckoutSessionCompleted(session);

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            receiverId: 'creator2',
            receiverProfileId: 'creator-hobby',
          }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'creator-hobby',
          senderId: 'tipper-hobby',
        }),
      );
      // Neither person's first Profile is looked up.
      expect(prisma.profile.findFirst).not.toHaveBeenCalled();
    });

    it('keeps a tip whose Profile was deleted since the payment, without it', async () => {
      const session = {
        id: 'cs_tip_3',
        client_reference_id: 'tipper1',
        amount_total: 500,
        currency: 'eur',
        payment_intent: 'pi_tip_789',
        metadata: {
          type: 'DIRECT_TIP',
          creatorId: 'creator2',
          profileId: 'gone-profile',
          senderProfileId: '',
          postId: '',
        },
      } as any;
      prisma.profile.findUnique = vi.fn().mockResolvedValue(null);
      prisma.profile.findFirst = vi.fn().mockResolvedValue({ id: 'first' });

      await service.handleCheckoutSessionCompleted(session);

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            receiverId: 'creator2',
            receiverProfileId: null,
          }),
        }),
      );
    });

    it('keeps an unlock whose post was deleted since the payment, without its Profile', async () => {
      prisma.post.findUnique = vi.fn().mockResolvedValue(null);
      const session = {
        id: 'cs_unlock_2',
        client_reference_id: 'buyer1',
        amount_total: 1000,
        currency: 'eur',
        payment_intent: 'pi_gone',
        metadata: {
          type: 'DIRECT_POST_UNLOCK',
          postId: 'post-gone',
          creatorId: 'creator1',
        },
      } as any;

      await service.handleCheckoutSessionCompleted(session);

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            receiverId: 'creator1',
            receiverProfileId: null,
            postId: 'post-gone',
          }),
        }),
      );
    });

    it('processes a DIRECT_STORY_UNLOCK checkout', async () => {
      const session = {
        id: 'cs_story_1',
        client_reference_id: 'buyer1',
        amount_total: 250,
        currency: 'eur',
        payment_intent: 'pi_story_1',
        metadata: {
          type: 'DIRECT_STORY_UNLOCK',
          storyId: 'story1',
          creatorId: 'creator1',
        },
      } as any;

      await service.handleCheckoutSessionCompleted(session);

      expect(prisma.storyUnlock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_storyId: { userId: 'buyer1', storyId: 'story1' } },
        }),
      );
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'DIRECT_STORY_UNLOCK',
            receiverProfileId: 'creator-prof-1',
            storyId: 'story1',
            stripePaymentIntentId: 'pi_story_1',
          }),
        }),
      );
    });

    it('processes a DIRECT_MESSAGE_UNLOCK checkout and notifies the creator', async () => {
      const session = {
        id: 'cs_msg_1',
        client_reference_id: 'buyer1',
        amount_total: 400,
        currency: 'eur',
        payment_intent: 'pi_msg_1',
        metadata: {
          type: 'DIRECT_MESSAGE_UNLOCK',
          messageId: 'msg1',
          creatorId: 'creator1',
        },
      } as any;

      prisma.profile.findFirst = vi
        .fn()
        .mockResolvedValueOnce({ id: 'creator-prof-1' })
        .mockResolvedValueOnce({ id: 'buyer-prof-1' });

      await service.handleCheckoutSessionCompleted(session);

      expect(prisma.messageUnlock.upsert).toHaveBeenCalledWith({
        where: { userId_messageId: { userId: 'buyer1', messageId: 'msg1' } },
        update: {},
        create: { userId: 'buyer1', messageId: 'msg1', pricePaid: 400 },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'creator-prof-1',
          senderId: 'buyer-prof-1',
          notice: expect.objectContaining({ key: 'message_unlocked' }),
        }),
      );
      expect(prisma.monetization.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'creator1' } }),
      );
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: 'msg1',
          receiverProfileId: 'creator-prof-1',
          status: 'COMPLETED',
        }),
      });
      expect(stripe.refundDestinationCharge).not.toHaveBeenCalled();
    });

    describe('a paid message that is deleted or gone', () => {
      const session = {
        id: 'cs_msg_gone',
        client_reference_id: 'buyer1',
        // 4 € paid, 0.69 € of it VAT: all of it goes back, and no VAT is
        // taken back from the creator, who keeps nothing.
        amount_subtotal: 400,
        amount_total: 400,
        total_details: { amount_tax: 69 },
        currency: 'eur',
        payment_intent: 'pi_msg_gone',
        metadata: {
          type: 'DIRECT_MESSAGE_UNLOCK',
          messageId: 'msg_gone',
          creatorId: 'creator1',
        },
      } as any;
      const refundAsked = {
        paymentIntentId: 'pi_msg_gone',
        amountInCents: 400,
        idempotencyKey: 'message-unlock-refund-cs_msg_gone',
        metadata: {
          type: 'DIRECT_MESSAGE_UNLOCK',
          reason: 'message_no_longer_exists',
          checkoutSessionId: 'cs_msg_gone',
        },
      };
      const alerted = (eventType: string) =>
        eventEmitter.emit.mock.calls.filter(
          ([name, payload]) =>
            name === 'payment.alert' && payload.eventType === eventType,
        );

      beforeEach(() => {
        prisma.message.findUnique.mockResolvedValue(null);
        prisma.transaction.findUnique.mockResolvedValue(null);
        prisma.transaction.create.mockResolvedValue({
          id: 'tx_gone',
          status: 'PENDING',
        });
        prisma.user.findUnique.mockImplementation(({ where }: any) =>
          Promise.resolve({ id: where.id }),
        );
      });

      it.each([
        ['is gone', null],
        ['was deleted by its sender', { id: 'msg_gone', isDeleted: true }],
      ])(
        'records the payment, refunds it in full once, pays the creator nothing and tells staff when the message %s',
        async (_case, message) => {
          prisma.message.findUnique.mockResolvedValue(message);

          await expect(
            service.handleCheckoutSessionCompleted(session),
          ).resolves.toBeUndefined();

          expect(prisma.message.findUnique).toHaveBeenCalledWith({
            where: { id: 'msg_gone' },
            select: { id: true, isDeleted: true, senderId: true },
          });
          expect(prisma.transaction.create).toHaveBeenCalledWith({
            data: {
              type: 'DIRECT_MESSAGE_UNLOCK',
              amount: 400,
              vatCents: 69,
              currency: 'EUR',
              senderId: 'buyer1',
              receiverId: 'creator1',
              messageId: null,
              stripePaymentIntentId: 'pi_msg_gone',
              status: 'PENDING',
              description: expect.stringContaining('is deleted or gone'),
            },
            select: { id: true, status: true },
          });
          expect(stripe.refundDestinationCharge).toHaveBeenCalledTimes(1);
          expect(stripe.refundDestinationCharge).toHaveBeenCalledWith(
            refundAsked,
          );
          expect(stripe.takeVatBackFromCreator).not.toHaveBeenCalled();
          expect(prisma.transaction.update).toHaveBeenCalledWith({
            where: { id: 'tx_gone' },
            data: { status: 'REFUNDED' },
          });
          expect(prisma.$transaction).not.toHaveBeenCalled();
          expect(prisma.messageUnlock.upsert).not.toHaveBeenCalled();
          expect(prisma.monetization.upsert).not.toHaveBeenCalled();
          expect(eventEmitter.emit).not.toHaveBeenCalledWith(
            'notification.create',
            expect.anything(),
          );
          expect(alerted('Message Unlock Refunded')).toEqual([
            [
              'payment.alert',
              expect.objectContaining({
                amount: 400,
                currency: 'EUR',
                userId: 'buyer1',
              }),
            ],
          ]);
        },
      );

      it('refunds once when the same event arrives again', async () => {
        let stored: { id: string; status: string } | null = null;
        prisma.transaction.findUnique.mockImplementation(() =>
          Promise.resolve(stored),
        );
        prisma.transaction.create.mockImplementation(() => {
          stored = { id: 'tx_gone', status: 'PENDING' };
          return Promise.resolve(stored);
        });
        prisma.transaction.update.mockImplementation(({ data }: any) => {
          stored = { id: 'tx_gone', status: data.status };
          return Promise.resolve(stored);
        });

        await service.handleCheckoutSessionCompleted(session);
        await service.handleCheckoutSessionCompleted(session);

        expect(stripe.refundDestinationCharge).toHaveBeenCalledTimes(1);
        expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
        expect(prisma.transaction.update).toHaveBeenCalledTimes(1);
        expect(alerted('Message Unlock Refunded')).toHaveLength(1);
      });

      it('asks again with the same key after a refund that failed, without a second record', async () => {
        prisma.transaction.findUnique.mockResolvedValue({
          id: 'tx_gone',
          status: 'PENDING',
        });

        await service.handleCheckoutSessionCompleted(session);

        expect(prisma.transaction.create).not.toHaveBeenCalled();
        expect(stripe.refundDestinationCharge).toHaveBeenCalledWith(
          refundAsked,
        );
        expect(prisma.transaction.update).toHaveBeenCalledWith({
          where: { id: 'tx_gone' },
          data: { status: 'REFUNDED' },
        });
      });

      it('keeps the payment without the people who were erased since', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await service.handleCheckoutSessionCompleted(session);

        expect(prisma.transaction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              senderId: null,
              receiverId: null,
            }),
          }),
        );
        expect(stripe.refundDestinationCharge).toHaveBeenCalledTimes(1);
      });

      it('fails, so the provider retries, and tells staff when the refund fails', async () => {
        const failure = new Error('provider unavailable');
        stripe.refundDestinationCharge.mockRejectedValue(failure);

        await expect(
          service.handleCheckoutSessionCompleted(session),
        ).rejects.toBe(failure);

        expect(prisma.transaction.update).not.toHaveBeenCalled();
        expect(alerted('Message Unlock Refund Failed')).toHaveLength(1);
        expect(alerted('Message Unlock Refunded')).toHaveLength(0);
      });

      it('counts the payment refunded when the provider says it already is', async () => {
        stripe.refundDestinationCharge.mockRejectedValue(
          Object.assign(new Error('already refunded'), {
            code: 'charge_already_refunded',
          }),
        );

        await expect(
          service.handleCheckoutSessionCompleted(session),
        ).resolves.toBeUndefined();

        expect(prisma.transaction.update).toHaveBeenCalledWith({
          where: { id: 'tx_gone' },
          data: { status: 'REFUNDED' },
        });
        expect(alerted('Message Unlock Refund Failed')).toHaveLength(0);
      });

      it.each(['COMPLETED', 'FAILED'])(
        'refunds nothing and asks staff to decide when the payment is already %s',
        async (status) => {
          const logger = (service as any).logger;
          vi.spyOn(logger, 'warn').mockImplementation(() => {});
          prisma.transaction.findUnique.mockResolvedValue({
            id: 'tx_earlier',
            status,
          });

          await expect(
            service.handleCheckoutSessionCompleted(session),
          ).resolves.toBeUndefined();

          expect(stripe.refundDestinationCharge).not.toHaveBeenCalled();
          expect(prisma.transaction.create).not.toHaveBeenCalled();
          expect(prisma.transaction.update).not.toHaveBeenCalled();
          expect(prisma.monetization.upsert).not.toHaveBeenCalled();
          expect(alerted('Message Unlock Refund Review')).toEqual([
            [
              'payment.alert',
              expect.objectContaining({
                description: expect.stringMatching(
                  new RegExp(`msg_gone.*cs_msg_gone.*tx_earlier.*${status}`),
                ),
              }),
            ],
          ]);
        },
      );

      it.each([
        'amount_too_large',
        'charge_disputed',
        'refund_disputed_payment',
        'charge_not_refundable',
      ])(
        'answers the notice and asks staff to finish by hand when the provider refuses the full refund (%s)',
        async (code) => {
          stripe.refundDestinationCharge.mockRejectedValue(
            Object.assign(new Error('refused'), { code }),
          );

          await expect(
            service.handleCheckoutSessionCompleted(session),
          ).resolves.toBeUndefined();

          expect(stripe.refundDestinationCharge).toHaveBeenCalledTimes(1);
          // Kept pending, never counted as the creator's, with a note for staff.
          expect(prisma.transaction.update).toHaveBeenCalledTimes(1);
          expect(prisma.transaction.update).toHaveBeenCalledWith({
            where: { id: 'tx_gone' },
            data: {
              description: expect.stringContaining(`refund by hand`),
            },
          });
          expect(prisma.monetization.upsert).not.toHaveBeenCalled();
          expect(alerted('Message Unlock Refund Needed')).toHaveLength(1);
          expect(alerted('Message Unlock Refund Failed')).toHaveLength(0);
          expect(alerted('Message Unlock Refunded')).toHaveLength(0);
        },
      );

      it('ends refunded, once, when the provider tells of the refund before it is marked', async () => {
        let stored: { id: string; status: string; type: string } | null = null;
        prisma.transaction.findUnique.mockImplementation(() =>
          Promise.resolve(stored && { ...stored }),
        );
        prisma.transaction.create.mockImplementation(() => {
          stored = {
            id: 'tx_gone',
            status: 'PENDING',
            type: 'DIRECT_MESSAGE_UNLOCK',
          };
          return Promise.resolve({ ...stored });
        });
        prisma.transaction.update.mockImplementation(({ data }: any) => {
          stored = { ...(stored as any), ...data };
          return Promise.resolve({ ...stored });
        });
        // The provider's refund notice arrives while the payment is still
        // pending, before this handler marks it.
        stripe.refundDestinationCharge.mockImplementation(async () => {
          await service.handleChargeRefunded({
            payment_intent: 'pi_msg_gone',
            amount: 400,
            amount_refunded: 400,
          });
          return { id: 're_1' };
        });

        await service.handleCheckoutSessionCompleted(session);
        await service.handleCheckoutSessionCompleted(session);
        await service.handleChargeRefunded({
          payment_intent: 'pi_msg_gone',
          amount: 400,
          amount_refunded: 400,
        });

        expect(stored).toEqual(expect.objectContaining({ status: 'REFUNDED' }));
        expect(stripe.refundDestinationCharge).toHaveBeenCalledTimes(1);
        expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
        expect(prisma.postUnlock.deleteMany).not.toHaveBeenCalled();
        expect(prisma.storyUnlock.deleteMany).not.toHaveBeenCalled();
        expect(prisma.messageUnlock.deleteMany).not.toHaveBeenCalled();
      });

      it('asks staff to refund by hand when the checkout names no payment', async () => {
        const logger = (service as any).logger;
        const error = vi.spyOn(logger, 'error').mockImplementation(() => {});

        await expect(
          service.handleCheckoutSessionCompleted({
            ...session,
            payment_intent: null,
            currency: null,
          }),
        ).resolves.toBeUndefined();

        expect(stripe.refundDestinationCharge).not.toHaveBeenCalled();
        expect(prisma.transaction.create).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledTimes(1);
        expect(alerted('Message Unlock Refund Needed')).toEqual([
          ['payment.alert', expect.objectContaining({ currency: 'EUR' })],
        ]);
      });

      it('follows the same rules for a deleted message: one refund per payment, earlier payments left to staff', async () => {
        prisma.message.findUnique.mockResolvedValue({
          id: 'msg_gone',
          isDeleted: true,
        });
        vi.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
        prisma.transaction.findUnique
          .mockResolvedValueOnce({ id: 'tx_gone', status: 'REFUNDED' })
          .mockResolvedValueOnce({ id: 'tx_earlier', status: 'COMPLETED' });

        await service.handleCheckoutSessionCompleted(session);
        await service.handleCheckoutSessionCompleted(session);

        expect(stripe.refundDestinationCharge).not.toHaveBeenCalled();
        expect(prisma.transaction.create).not.toHaveBeenCalled();
        expect(prisma.messageUnlock.upsert).not.toHaveBeenCalled();
        expect(alerted('Message Unlock Refund Review')).toHaveLength(1);
      });

      it('refunds without telling staff when nobody listens for alerts', async () => {
        const quiet = new MonetizationWebhookService(
          prisma,
          stripe as never,
          undefined,
        );

        await expect(
          quiet.handleCheckoutSessionCompleted(session),
        ).resolves.toBeUndefined();

        expect(stripe.refundDestinationCharge).toHaveBeenCalledTimes(1);
      });
    });

    it('processes a DIRECT_LIVE_GIFT checkout by emitting payment.live_gift_completed', async () => {
      const session = {
        id: 'cs_gift_1',
        client_reference_id: 'gifter1',
        amount_total: 200,
        currency: 'eur',
        payment_intent: 'pi_gift_1',
        metadata: {
          type: 'DIRECT_LIVE_GIFT',
          liveGiftId: 'lg_1',
          streamId: 'str_1',
          giftId: 'rose',
          creatorId: 'creator1',
        },
      } as any;

      await service.handleCheckoutSessionCompleted(session);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.live_gift_completed',
        expect.objectContaining({
          liveGiftId: 'lg_1',
          streamId: 'str_1',
          giftId: 'rose',
          creatorId: 'creator1',
          amountCents: 200,
        }),
      );
    });

    it('ignores legacy VIP Subscription (STRIPE_SUBSCRIPTION) metadata as a no-op', async () => {
      const session = {
        id: 'cs_vip',
        metadata: { type: 'STRIPE_SUBSCRIPTION' },
      } as any;

      await expect(
        service.handleCheckoutSessionCompleted(session),
      ).resolves.toBeUndefined();
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('handles DIRECT_LIVE_GIFT without an eventEmitter or missing metadata', async () => {
      const serviceNoEmitter = new MonetizationWebhookService(
        prisma,
        stripe as never,
        undefined,
      );
      await expect(
        serviceNoEmitter.handleCheckoutSessionCompleted({
          id: 'cs_live_err',
          client_reference_id: '',
          metadata: { type: 'DIRECT_LIVE_GIFT' },
        } as any),
      ).resolves.toBeUndefined();

      await expect(
        service.handleCheckoutSessionCompleted({
          id: 'cs_live_slack',
          client_reference_id: 'u_giftee',
          amount_total: 250,
          metadata: {
            type: 'DIRECT_LIVE_GIFT',
            liveGiftId: 'gift_1',
            streamId: 'stream_1',
            giftId: 'g_1',
            creatorId: 'creator_1',
          },
        } as any),
      ).resolves.toBeUndefined();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.alert',
        expect.objectContaining({ eventType: 'Live Gift' }),
      );
    });
  });

  describe('emitPaymentNotification (private, via DIRECT_TIP/MESSAGE_UNLOCK)', () => {
    it('exits early when eventEmitter is missing or recipient has no profile', async () => {
      const serviceNoEmitter = new MonetizationWebhookService(
        prisma,
        stripe as never,
        undefined,
      );
      await (serviceNoEmitter as any).emitPaymentNotification({
        recipientUserId: 'u_recip',
        senderUserId: 'u_send',
        content: 'Tip received',
      });

      prisma.profile.findFirst = vi.fn().mockResolvedValue(null);
      await (service as any).emitPaymentNotification({
        recipientUserId: 'u_recip',
        senderUserId: 'u_send',
        content: 'Tip received',
      });
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleCheckoutSessionExpired', () => {
    it('marks a PENDING promotion FAILED', async () => {
      await service.handleCheckoutSessionExpired({
        id: 'cs_exp',
        metadata: { type: 'PROMOTION', promotionId: 'promo_exp' },
      } as any);

      expect(prisma.promotion.updateMany).toHaveBeenCalledWith({
        where: { id: 'promo_exp', status: 'PENDING' },
        data: { status: 'FAILED' },
      });
    });
  });

  describe('handleAccountUpdated', () => {
    // The provider answers the account as the event shows it, unless a test
    // says otherwise.
    const deliver = (
      account: Parameters<typeof service.handleAccountUpdated>[0],
    ) => {
      stripe.getAccount = vi.fn().mockResolvedValue(account);
      return service.handleAccountUpdated(account);
    };
    const holdsAccount = () =>
      prisma.monetization.findUnique.mockImplementation(
        async ({ where }: { where: { stripeConnectAccountId?: string } }) =>
          where.stripeConnectAccountId
            ? { userId: 'creator1' }
            : { profileId: 'creator-prof-1', stripeConnectAccountId: 'acct_1' },
      );

    it('leaves an account no row holds alone', async () => {
      await deliver({ id: 'acct_unknown' });
      expect(prisma.monetization.update).not.toHaveBeenCalled();
    });

    it('syncs Connect capability flags for the linked user', async () => {
      // The row holding the account, found by it.
      holdsAccount();

      await deliver({
        id: 'acct_1',
        charges_enabled: true,
        capabilities: { transfers: 'active' },
      });

      expect(prisma.monetization.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeConnectAccountId: 'acct_1' },
        }),
      );
      // The row keeps its Profile and its account.
      expect(prisma.monetization.update).toHaveBeenCalledWith({
        where: { stripeConnectAccountId: 'acct_1' },
        data: {
          transfersEnabled: true,
          chargesEnabled: true,
          verifiedCompany: false,
        },
      });
    });

    it('records a company the provider has finished verifying', async () => {
      // The row holding the account, found by it.
      holdsAccount();

      await deliver({
        id: 'acct_1',
        charges_enabled: true,
        capabilities: { transfers: 'active' },
        business_type: 'company',
        details_submitted: true,
        requirements: { currently_due: [], disabled_reason: null },
      });

      expect(prisma.monetization.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ verifiedCompany: true }),
        }),
      );
    });

    it("updates a Profile's own row without placing it with a person", async () => {
      prisma.monetization.findUnique.mockResolvedValue({ userId: null });
      prisma.profile.findMany.mockClear();

      await deliver({
        id: 'acct_second',
        charges_enabled: true,
        capabilities: { transfers: 'active' },
      });

      expect(prisma.profile.findMany).not.toHaveBeenCalled();
      expect(prisma.monetization.update).toHaveBeenCalledWith({
        where: { stripeConnectAccountId: 'acct_second' },
        data: {
          transfersEnabled: true,
          chargesEnabled: true,
          verifiedCompany: false,
        },
      });
    });

    it('keeps an account ready when an older event of it arrives late', async () => {
      holdsAccount();
      // The event is an older snapshot; the account is ready now.
      stripe.getAccount = vi.fn().mockResolvedValue({
        id: 'acct_1',
        charges_enabled: true,
        capabilities: { transfers: 'active' },
      });

      await service.handleAccountUpdated({
        id: 'acct_1',
        charges_enabled: false,
        capabilities: { transfers: 'inactive' },
      });

      expect(stripe.getAccount).toHaveBeenCalledWith('acct_1');
      expect(prisma.monetization.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            transfersEnabled: true,
            chargesEnabled: true,
          }),
        }),
      );
    });

    it('does not record the account of a person as a company', async () => {
      // The row holding the account, found by it.
      holdsAccount();

      await deliver({
        id: 'acct_1',
        charges_enabled: true,
        capabilities: { transfers: 'active' },
        business_type: 'individual',
        details_submitted: true,
      });

      expect(prisma.monetization.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ verifiedCompany: false }),
        }),
      );
    });
  });

  describe('syncConnectPayoutLog', () => {
    it('upserts StripePayoutLog on a paid payout, with the Profile holding the account', async () => {
      prisma.monetization.findUnique.mockResolvedValue({
        userId: 'creator1',
        profileId: 'creator-prof-1',
      });
      prisma.stripePayoutLog.upsert = vi.fn().mockResolvedValue({});

      await service.syncConnectPayoutLog({
        account: 'acct_1',
        data: {
          object: {
            id: 'po_1',
            amount: 2500,
            currency: 'eur',
            status: 'paid',
            arrival_date: 1_714_521_600,
          },
        },
      });

      expect(prisma.stripePayoutLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripePayoutId: 'po_1' },
          create: expect.objectContaining({
            userId: 'creator1',
            profileId: 'creator-prof-1',
            amountCents: 2500,
            currency: 'eur',
            status: 'paid',
          }),
          update: expect.objectContaining({
            profileId: 'creator-prof-1',
            status: 'paid',
            amountCents: 2500,
          }),
        }),
      );
    });

    it("names the person of a payout from a Profile's own account through its Profile", async () => {
      prisma.monetization.findUnique.mockResolvedValue({
        userId: null,
        profileId: 'creator-prof-2',
        profile: { userId: 'creator1' },
      });
      prisma.stripePayoutLog.upsert = vi.fn().mockResolvedValue({});

      await service.syncConnectPayoutLog({
        account: 'acct_second',
        data: {
          object: {
            id: 'po_3',
            amount: 900,
            currency: 'eur',
            status: 'paid',
            arrival_date: 1_714_521_600,
          },
        },
      });

      expect(prisma.stripePayoutLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            userId: 'creator1',
            profileId: 'creator-prof-2',
          }),
        }),
      );
    });

    it('maps in_transit payouts to pending and skips unknown Connect accounts', async () => {
      prisma.monetization.findUnique.mockResolvedValueOnce({
        userId: 'creator1',
        profileId: null,
      });

      await service.syncConnectPayoutLog({
        account: 'acct_1',
        data: {
          object: {
            id: 'po_2',
            amount: 100,
            currency: 'eur',
            status: 'in_transit',
            arrival_date: 1_714_521_600,
          },
        },
      });
      expect(prisma.stripePayoutLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          // A person whose row holds no Profile yet: the payout keeps none.
          create: expect.objectContaining({
            status: 'pending',
            profileId: null,
          }),
          update: expect.objectContaining({ status: 'pending' }),
        }),
      );

      prisma.monetization.findUnique.mockResolvedValueOnce(null);
      prisma.stripePayoutLog.upsert = vi.fn();
      await service.syncConnectPayoutLog({
        account: 'acct_unknown',
        data: { object: { id: 'po_3', amount: 1, status: 'failed' } },
      });
      expect(prisma.stripePayoutLog.upsert).not.toHaveBeenCalled();
    });

    it('handles a Connect payout event missing accountId or payoutId', async () => {
      await expect(
        service.syncConnectPayoutLog({
          account: undefined,
          data: { object: { id: undefined } },
        }),
      ).resolves.toBeUndefined();
      expect(prisma.stripePayoutLog.upsert).not.toHaveBeenCalled();
    });
  });
});
