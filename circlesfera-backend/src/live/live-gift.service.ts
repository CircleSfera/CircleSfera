import {
  ErrorCode,
  type PaymentLiveGiftCompletedEvent,
} from '@circlesfera/shared';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CREATOR_SHARE_DECIMAL,
  PLATFORM_FEE_DECIMAL,
} from '../common/constants/monetization.constants.js';
import { AppException } from '../common/errors/app.exception.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppGateway } from '../socket/app.gateway.js';
import {
  LIVE_GIFT_CATALOG,
  resolveGiftAmountCents,
  resolveGiftName,
} from './gift-catalog.js';

function appendCheckoutQuery(returnUrl: string, query: string): string {
  const sep = returnUrl.includes('?') ? '&' : '?';
  return `${returnUrl}${sep}${query}`;
}

// Owns live-gift monetization end to end: Stripe Checkout session creation,
// webhook-driven completion, ledger/earnings updates, and the completion
// broadcast. Kept separate from LiveService's stream/co-host lifecycle so
// this money-critical path has one clear owner.
@Injectable()
export class LiveGiftService {
  private readonly logger = new Logger(LiveGiftService.name);
  /** Deduplicates concurrent or retried gift-creation calls by idempotency key. */
  private readonly giftInFlight = new Map<string, Promise<any>>();

  constructor(
    private prisma: PrismaService,
    private gateway: AppGateway,
    private stripeService: StripeService,
  ) {}

  // Create a Stripe Checkout session for a live gift.
  // Price is resolved from the server-side catalog (client price ignored).
  async sendGift(
    streamId: string,
    senderId: string,
    giftId: string,
    returnUrl: string,
    idempotencyKey?: string,
  ) {
    const amountCents = resolveGiftAmountCents(giftId);
    if (amountCents === null) {
      throw new BadRequestException(
        `Unknown giftId. Allowed: ${Object.keys(LIVE_GIFT_CATALOG).join(', ')}`,
      );
    }

    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      include: {
        host: {
          select: {
            id: true,
            userId: true,
            username: true,
            user: {
              select: {
                email: true,
                stripeConnectAccountId: true,
              },
            },
          },
        },
      },
    });

    if (stream?.status !== 'LIVE') {
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_ACTIVE,
        'Live stream not active',
      );
    }

    if (stream.host.userId === senderId) {
      throw AppException.BadRequest(
        ErrorCode.CANNOT_GIFT_SELF,
        'You cannot gift yourself',
      );
    }

    if (!stream.host.user?.stripeConnectAccountId) {
      throw new BadRequestException(
        'Host cannot receive gifts yet (no Stripe Connect account)',
      );
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: {
        id: true,
        email: true,
        profiles: { select: { username: true } },
      },
    });
    if (!sender)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    const platformFee = Math.floor(amountCents * PLATFORM_FEE_DECIMAL);
    const giftName = resolveGiftName(giftId, 'en');
    if (!giftName) {
      throw new BadRequestException(
        `Unknown giftId. Allowed: ${Object.keys(LIVE_GIFT_CATALOG).join(', ')}`,
      );
    }

    // Concurrent or retried calls sharing the same idempotencyKey must resolve
    // to the same promise and must not create duplicate local records.
    if (idempotencyKey) {
      const inFlight = this.giftInFlight.get(idempotencyKey);
      if (inFlight) {
        return inFlight;
      }
    }

    const giftPromise = (async () => {
      try {
        // On a retry with the same key, reuse an existing PENDING gift record
        // to avoid inserting duplicates before reaching Stripe.
        let pendingGift = idempotencyKey
          ? await this.prisma.liveGift.findFirst({
              where: {
                streamId,
                senderId,
                giftId,
                status: 'PENDING',
                // We store the idempotencyKey in stripeCheckoutSessionId as null initially;
                // re-identify by composite (streamId, senderId, giftId, PENDING) + idempotencyKey
                // via a dedicated approach: check if a session already exists.
              },
            })
          : null;

        if (pendingGift?.stripeCheckoutSessionId) {
          // Already have a Stripe session from a previous attempt — return it without
          // calling Stripe again.
          return {
            url: null, // Session URL is not stored locally; client must use session_id to resume
            liveGiftId: pendingGift.id,
            giftId,
            amountCents,
          };
        }

        if (!pendingGift) {
          pendingGift = await this.prisma.liveGift.create({
            data: {
              streamId,
              senderId,
              receiverId: stream.host.userId,
              giftId,
              amountCents,
              currency: 'EUR',
              status: 'PENDING',
            },
          });
        }

        const session = await this.stripeService.createCheckoutSession(
          {
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: sender.email,
            client_reference_id: senderId,
            line_items: [
              {
                price_data: {
                  currency: 'eur',
                  product_data: {
                    name: `Live Gift: ${giftName}`,
                    description: `Gift for @${stream.host.username || 'creator'}`,
                  },
                  unit_amount: amountCents,
                },
                quantity: 1,
              },
            ],
            payment_intent_data: {
              application_fee_amount: platformFee,
              transfer_data: {
                destination: stream.host.user!.stripeConnectAccountId!,
              },
            },
            metadata: {
              type: 'DIRECT_LIVE_GIFT',
              liveGiftId: pendingGift.id,
              streamId,
              giftId,
              creatorId: stream.hostId,
            },
            success_url: appendCheckoutQuery(
              returnUrl,
              'gift_success=true&session_id={CHECKOUT_SESSION_ID}',
            ),
            cancel_url: appendCheckoutQuery(returnUrl, 'gift_canceled=true'),
          },
          { idempotencyKey },
        );

        await this.prisma.liveGift.update({
          where: { id: pendingGift.id },
          data: { stripeCheckoutSessionId: session.id },
        });

        return {
          url: session.url,
          liveGiftId: pendingGift.id,
          giftId,
          amountCents,
        };
      } finally {
        if (idempotencyKey) {
          this.giftInFlight.delete(idempotencyKey);
        }
      }
    })();

    if (idempotencyKey) {
      this.giftInFlight.set(idempotencyKey, giftPromise);
    }
    return giftPromise;
  }

  // Called from Stripe webhook after successful payment.
  // Persists ledger rows, updates earnings, broadcasts to the live room.
  @OnEvent('payment.live_gift_completed')
  async handleLiveGiftPayment(
    payload: PaymentLiveGiftCompletedEvent['payload'],
  ) {
    this.logger.log(
      `Received payment.live_gift_completed for ${payload.liveGiftId}`,
    );
    await this.completeGiftPayment(payload);
  }

  async completeGiftPayment(params: {
    liveGiftId: string;
    senderId: string;
    streamId: string;
    giftId: string;
    creatorId: string;
    amountCents: number;
    currency: string;
    paymentIntentId: string | null;
  }) {
    const existing = await this.prisma.liveGift.findUnique({
      where: { id: params.liveGiftId },
      include: {
        sender: {
          select: { profiles: { select: { username: true, avatar: true } } },
        },
      },
    });

    if (!existing) {
      this.logger.warn(`LiveGift ${params.liveGiftId} not found for webhook`);
      return;
    }

    if (existing.status === 'COMPLETED') {
      return; // Idempotent
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          type: 'DIRECT_LIVE_GIFT',
          amount: params.amountCents,
          currency: params.currency.toUpperCase(),
          senderId: params.senderId,
          receiverId: params.creatorId,
          liveStreamId: params.streamId,
          stripePaymentIntentId: params.paymentIntentId,
          status: 'COMPLETED',
          description: `Live gift ${params.giftId} on stream ${params.streamId}`,
        },
      });

      const gift = await tx.liveGift.update({
        where: { id: params.liveGiftId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          transactionId: transaction.id,
          amountCents: params.amountCents,
        },
      });

      await tx.monetization.upsert({
        where: { userId: params.creatorId },
        update: {
          lifetimeEarningsCents: {
            increment: Math.floor(params.amountCents * CREATOR_SHARE_DECIMAL),
          },
        },
        create: {
          userId: params.creatorId,
          lifetimeEarningsCents: Math.floor(
            params.amountCents * CREATOR_SHARE_DECIMAL,
          ),
        },
      });

      return gift;
    });

    this.gateway.server.to(`live:${params.streamId}`).emit('live:gift', {
      streamId: params.streamId,
      giftId: params.giftId,
      amountCents: params.amountCents,
      senderId: params.senderId,
      senderUsername: existing.sender?.profiles[0]?.username,
      senderAvatar: existing.sender?.profiles[0]?.avatar,
      receiverId: params.creatorId,
      liveGiftId: result.id,
      sentAt: new Date().toISOString(),
    });

    this.logger.log(
      `Live gift ${params.liveGiftId} completed on stream ${params.streamId}`,
    );
  }
}
