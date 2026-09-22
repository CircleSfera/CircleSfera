import {
  ErrorCode,
  type PaymentLiveGiftCompletedEvent,
} from '@circlesfera/shared';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type Stripe from 'stripe';
import { CREATOR_SHARE_DECIMAL } from '../common/constants/monetization.constants.js';
import { AppException } from '../common/errors/app.exception.js';
import { deriveConnectAccountFlags } from '../common/stripe/stripe.service.js';
import { primaryProfileIdForUser } from '../common/utils/user-profile-shape.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';

// Stripe Checkout Session metadata.type values fulfilled here rather than
// by PaymentsService's platform-subscription branch. STRIPE_SUBSCRIPTION is
// dead legacy metadata (VIP subscriptions removed in Phase 11) — routed
// here too so it stays a no-op instead of falling through to real
// subscription-checkout processing.
const MONETIZATION_CHECKOUT_TYPES = new Set([
  'PROMOTION',
  'DIRECT_POST_UNLOCK',
  'DIRECT_STORY_UNLOCK',
  'DIRECT_MESSAGE_UNLOCK',
  'DIRECT_TIP',
  'DIRECT_LIVE_GIFT',
  'STRIPE_SUBSCRIPTION',
]);

export function isMonetizationCheckoutType(type: string | undefined): boolean {
  return !!type && MONETIZATION_CHECKOUT_TYPES.has(type);
}

/**
 * Owns fulfillment for every Stripe webhook event tied to creator
 * monetization and Stripe Connect — as opposed to platform subscription
 * billing, which stays in PaymentsService. Both share the same Stripe
 * webhook signature verification, WebhookEvent idempotency/lease
 * bookkeeping and single `/payments/webhook` endpoint (PaymentsService),
 * per FIN-008: independent application boundaries, shared Stripe
 * infrastructure.
 */
@Injectable()
export class MonetizationWebhookService {
  private readonly logger = new Logger(MonetizationWebhookService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SlackService) private readonly slackService: SlackService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  private async emitPaymentNotification(params: {
    recipientUserId: string;
    senderUserId: string;
    content: string;
    postId?: string;
  }) {
    if (!this.eventEmitter) return;
    const [recipientId, senderId] = await Promise.all([
      primaryProfileIdForUser(this.prisma, params.recipientUserId),
      primaryProfileIdForUser(this.prisma, params.senderUserId),
    ]);
    if (!recipientId) return;
    this.eventEmitter.emit('notification.create', {
      recipientId,
      senderId,
      type: 'PAYMENT' as const,
      content: params.content,
      postId: params.postId,
    });
  }

  async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const metadata = session.metadata;

    if (metadata?.type === 'PROMOTION') {
      const promotionId = metadata.promotionId;
      if (!promotionId) {
        throw AppException.BadRequest(
          ErrorCode.PROMOTION_ID_MISSING,
          'PROMOTION checkout missing promotionId',
        );
      }

      const amount = session.amount_total || 0;
      const currency = (session.currency || 'eur').toUpperCase();

      await this.prisma.$transaction(async (tx) => {
        await tx.promotion.update({
          where: { id: promotionId },
          data: {
            status: 'ACTIVE',
            chargedAt: new Date(),
          },
        });

        await tx.transaction.create({
          data: {
            type: 'PROMOTION_PAYMENT',
            amount,
            currency,
            status: 'COMPLETED',
            senderId: metadata.userId || null,
            receiverId: null,
            promotionId,
            stripePaymentIntentId:
              typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id || session.id,
            description: `Promotion checkout ${session.id}`,
          },
        });
      });

      this.logger.log(
        `Successfully processed promotion payment for ${promotionId}`,
      );
      this.slackService
        .sendPaymentAlert({
          eventType: 'Promotion Payment',
          amount,
          currency: session.currency || 'eur',
          description: `Promotion ID: ${promotionId}`,
        })
        .catch((e) => this.logger.error(e));
    } else if (metadata?.type === 'DIRECT_POST_UNLOCK') {
      const clientReferenceId = session.client_reference_id;
      const { postId, creatorId } = metadata;
      const amount = session.amount_total || 0;
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.id;

      if (clientReferenceId && postId && creatorId) {
        await this.prisma.$transaction(async (tx) => {
          await tx.postUnlock.upsert({
            where: { userId_postId: { userId: clientReferenceId, postId } },
            update: {},
            create: {
              userId: clientReferenceId,
              postId,
              pricePaid: amount,
            },
          });

          await tx.transaction.create({
            data: {
              type: 'DIRECT_POST_UNLOCK',
              amount: amount,
              currency: (session.currency || 'eur').toUpperCase(),
              senderId: clientReferenceId,
              receiverId: creatorId,
              postId: postId,
              stripePaymentIntentId:
                typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : session.payment_intent?.id || session.id,
              status: 'COMPLETED',
              description: `Direct Post Unlock (Intent: ${paymentIntentId})`,
            },
          });

          await tx.monetization.upsert({
            where: { userId: creatorId },
            update: {
              lifetimeEarningsCents: {
                increment: Math.floor(amount * CREATOR_SHARE_DECIMAL),
              },
            },
            create: {
              userId: creatorId,
              lifetimeEarningsCents: Math.floor(amount * CREATOR_SHARE_DECIMAL),
            },
          });
        });
        this.logger.log(
          `Successfully processed Post Unlock for user ${clientReferenceId}`,
        );
        this.slackService
          .sendPaymentAlert({
            eventType: 'Post Unlock',
            amount: amount,
            currency: session.currency || 'eur',
            description: `User ${clientReferenceId} unlocked post ${postId} by creator ${creatorId}`,
            userId: clientReferenceId,
          })
          .catch((e) => this.logger.error(e));
      }
    } else if (metadata?.type === 'DIRECT_STORY_UNLOCK') {
      const clientReferenceId = session.client_reference_id;
      const { storyId, creatorId } = metadata;
      const amount = session.amount_total || 0;
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || session.id;

      if (clientReferenceId && storyId && creatorId) {
        await this.prisma.$transaction(async (tx) => {
          await tx.storyUnlock.upsert({
            where: {
              userId_storyId: { userId: clientReferenceId, storyId },
            },
            update: {},
            create: {
              userId: clientReferenceId,
              storyId,
              pricePaid: amount,
            },
          });

          await tx.transaction.create({
            data: {
              type: 'DIRECT_STORY_UNLOCK',
              amount,
              currency: (session.currency || 'eur').toUpperCase(),
              senderId: clientReferenceId,
              receiverId: creatorId,
              storyId,
              stripePaymentIntentId:
                typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : session.payment_intent?.id || session.id,
              status: 'COMPLETED',
              description: `Direct Story Unlock (Intent: ${paymentIntentId})`,
            },
          });

          await tx.monetization.upsert({
            where: { userId: creatorId },
            update: {
              lifetimeEarningsCents: {
                increment: Math.floor(amount * CREATOR_SHARE_DECIMAL),
              },
            },
            create: {
              userId: creatorId,
              lifetimeEarningsCents: Math.floor(amount * CREATOR_SHARE_DECIMAL),
            },
          });
        });
      }
    } else if (metadata?.type === 'DIRECT_MESSAGE_UNLOCK') {
      const clientReferenceId = session.client_reference_id;
      const { messageId, creatorId } = metadata;
      const amount = session.amount_total || 0;
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || session.id;

      if (clientReferenceId && messageId && creatorId) {
        await this.prisma.$transaction(async (tx) => {
          await tx.messageUnlock.upsert({
            where: {
              userId_messageId: { userId: clientReferenceId, messageId },
            },
            update: {},
            create: {
              userId: clientReferenceId,
              messageId,
              pricePaid: amount,
            },
          });

          await tx.transaction.create({
            data: {
              type: 'DIRECT_MESSAGE_UNLOCK' as any,
              amount,
              currency: (session.currency || 'eur').toUpperCase(),
              senderId: clientReferenceId,
              receiverId: creatorId,
              messageId,
              stripePaymentIntentId:
                typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : session.payment_intent?.id || session.id,
              status: 'COMPLETED',
              description: `Direct Message Unlock (Intent: ${paymentIntentId})`,
            },
          });

          await tx.monetization.upsert({
            where: { userId: creatorId },
            update: {
              lifetimeEarningsCents: {
                increment: Math.floor(amount * CREATOR_SHARE_DECIMAL),
              },
            },
            create: {
              userId: creatorId,
              lifetimeEarningsCents: Math.floor(amount * CREATOR_SHARE_DECIMAL),
            },
          });
        });

        const amountFormatted = (amount / 100).toLocaleString('en-US', {
          style: 'currency',
          currency: session.currency || 'eur',
        });
        await this.emitPaymentNotification({
          recipientUserId: creatorId,
          senderUserId: clientReferenceId,
          content: `Someone unlocked your private message for ${amountFormatted}!`,
        });
      }
    } else if (metadata?.type === 'DIRECT_TIP') {
      const clientReferenceId = session.client_reference_id;
      const { creatorId, postId } = metadata;
      const amount = session.amount_total || 0;
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.id;

      if (clientReferenceId && creatorId) {
        await this.prisma.$transaction(async (tx) => {
          await tx.transaction.create({
            data: {
              type: 'DIRECT_TIP',
              amount: amount,
              currency: (session.currency || 'eur').toUpperCase(),
              senderId: clientReferenceId,
              receiverId: creatorId,
              postId: postId || null,
              stripePaymentIntentId:
                typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : session.payment_intent?.id || session.id,
              status: 'COMPLETED',
              description: `Creator Tip (Intent: ${paymentIntentId})`,
            },
          });

          await tx.monetization.upsert({
            where: { userId: creatorId },
            update: {
              lifetimeEarningsCents: {
                increment: Math.floor(amount * CREATOR_SHARE_DECIMAL),
              },
            },
            create: {
              userId: creatorId,
              lifetimeEarningsCents: Math.floor(amount * CREATOR_SHARE_DECIMAL),
            },
          });
        });
        this.logger.log(
          `Successfully processed Tip from user ${clientReferenceId} to ${creatorId}`,
        );
        this.slackService
          .sendPaymentAlert({
            eventType: 'Creator Tip',
            amount: amount,
            currency: session.currency || 'eur',
            description: `User ${clientReferenceId} tipped creator ${creatorId}`,
            userId: clientReferenceId,
          })
          .catch((e) => this.logger.error(e));

        const amountFormatted = (amount / 100).toLocaleString('en-US', {
          style: 'currency',
          currency: session.currency || 'eur',
        });
        await this.emitPaymentNotification({
          recipientUserId: creatorId,
          senderUserId: clientReferenceId,
          content: `You received a ${amountFormatted} tip!`,
          postId: postId || undefined,
        });
      }
    } else if (metadata?.type === 'DIRECT_LIVE_GIFT') {
      const clientReferenceId = session.client_reference_id;
      const { liveGiftId, streamId, giftId, creatorId } = metadata;
      const amount = session.amount_total || 0;
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || session.id;

      if (clientReferenceId && liveGiftId && streamId && creatorId) {
        if (this.eventEmitter) {
          const payload: PaymentLiveGiftCompletedEvent['payload'] = {
            liveGiftId,
            senderId: clientReferenceId,
            streamId,
            giftId,
            creatorId,
            amountCents: amount,
            currency: session.currency || 'eur',
            paymentIntentId,
          };
          this.eventEmitter.emit('payment.live_gift_completed', payload);
        }
        this.logger.log(
          `Successfully processed Live Gift ${liveGiftId} from ${clientReferenceId}`,
        );
        this.slackService
          .sendPaymentAlert({
            eventType: 'Live Gift',
            amount,
            currency: session.currency || 'eur',
            description: `User ${clientReferenceId} gifted ${giftId} on stream ${streamId}`,
            userId: clientReferenceId,
          })
          .catch((e) => this.logger.error(e));
      } else if (!this.eventEmitter) {
        this.logger.error(
          'EventEmitter not available to complete DIRECT_LIVE_GIFT',
        );
      }
    } else if (metadata?.type === 'STRIPE_SUBSCRIPTION') {
      // VIP Subscriptions removed in Phase 11
      this.logger.debug('Legacy VIP Subscription event ignored.');
    }
  }

  async handleCheckoutSessionExpired(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const metadata = session.metadata;
    if (metadata?.type === 'PROMOTION' && metadata.promotionId) {
      await this.prisma.promotion.updateMany({
        where: {
          id: metadata.promotionId,
          status: 'PENDING',
        },
        data: { status: 'FAILED' },
      });
    }
  }

  async handleChargeRefundedOrDisputed(charge: {
    payment_intent?: string | { id: string } | null;
  }): Promise<void> {
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;
    if (paymentIntentId) {
      await this.revokeAccessForPaymentIntent(paymentIntentId);
    }
  }

  // Revoke unlock entitlements after refund or dispute.
  private async revokeAccessForPaymentIntent(paymentIntentId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!tx) {
      return;
    }

    // Idempotent: a duplicate refund/dispute webhook for an already-revoked
    // transaction is a no-op, not a re-run of the unlock deletion below.
    if (tx.status === 'REFUNDED') {
      return;
    }

    // A charge that never completed on our side has nothing to refund.
    // Marking it REFUNDED would misrepresent money that was never captured.
    if (tx.status === 'FAILED') {
      this.logger.warn(
        `Received refund/dispute webhook for Transaction ${tx.id} (paymentIntent ${paymentIntentId}) which is already FAILED. Skipping status transition.`,
      );
      return;
    }

    await this.prisma.transaction.update({
      where: { id: tx.id },
      data: { status: 'REFUNDED' },
    });

    if (tx.type === 'DIRECT_POST_UNLOCK' && tx.senderId && tx.postId) {
      await this.prisma.postUnlock.deleteMany({
        where: { userId: tx.senderId, postId: tx.postId },
      });
    }
    if (tx.type === 'DIRECT_STORY_UNLOCK' && tx.senderId && tx.storyId) {
      await this.prisma.storyUnlock.deleteMany({
        where: { userId: tx.senderId, storyId: tx.storyId },
      });
    }
  }

  // Mirror a Connect Express payout into StripePayoutLog.
  // Does not create Transaction rows or call payouts.create.
  private mapConnectPayoutStatus(status: string): string {
    if (status === 'in_transit') return 'pending';
    return status;
  }

  async syncConnectPayoutLog(event: {
    account?: string;
    data: {
      object: {
        id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        arrival_date?: number;
        failure_code?: string | null;
        failure_message?: string | null;
      };
    };
  }): Promise<void> {
    const accountId = event.account;
    const payout = event.data?.object;
    if (!accountId || !payout?.id) {
      this.logger.warn('Connect payout webhook missing account or payout id');
      return;
    }

    const user = await this.prisma.user.findFirst({
      where: { stripeConnectAccountId: accountId },
      select: { id: true },
    });
    if (!user) {
      this.logger.warn(
        `No User linked to Connect account for payout ${payout.id}`,
      );
      return;
    }

    const arrivalDate = payout.arrival_date
      ? new Date(payout.arrival_date * 1000)
      : new Date();
    const status = this.mapConnectPayoutStatus(payout.status || 'pending');
    const currency = (payout.currency || 'eur').toLowerCase();
    const failureReason = payout.failure_message || payout.failure_code || null;

    await this.prisma.stripePayoutLog.upsert({
      where: { stripePayoutId: payout.id },
      create: {
        stripePayoutId: payout.id,
        userId: user.id,
        amountCents: payout.amount ?? 0,
        currency,
        status,
        arrivalDate,
        failureReason,
      },
      update: {
        amountCents: payout.amount ?? 0,
        currency,
        status,
        arrivalDate,
        failureReason,
      },
    });
  }

  async handleAccountUpdated(account: {
    id: string;
    charges_enabled?: boolean;
    capabilities?: { transfers?: string };
  }): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { stripeConnectAccountId: account.id },
      select: { id: true },
    });
    if (user) {
      const { transfersEnabled, chargesEnabled } =
        deriveConnectAccountFlags(account);
      await this.prisma.monetization.upsert({
        where: { userId: user.id },
        update: { transfersEnabled, chargesEnabled },
        create: { userId: user.id, transfersEnabled, chargesEnabled },
      });
    }
  }
}
