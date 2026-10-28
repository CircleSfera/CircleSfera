import {
  ErrorCode,
  type NotificationCreateEvent,
  type PaymentAlertEvent,
  type PaymentLiveGiftCompletedEvent,
} from '@circlesfera/shared';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type Stripe from 'stripe';
import { CREATOR_SHARE_DECIMAL } from '../common/constants/monetization.constants.js';
import { AppException } from '../common/errors/app.exception.js';
import {
  type ConnectAccountCompanyFields,
  deriveConnectAccountFlags,
  isVerifiedCompanyAccount,
  StripeService,
} from '../common/stripe/stripe.service.js';
import { primaryProfileIdForUser } from '../common/utils/user-profile-shape.util.js';
import type { Notice } from '../notifications/notice-copy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { payoutAccountOf } from './payout-account.js';

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
 * bookkeeping and single `/payments/webhook` endpoint (PaymentsService):
 * independent application boundaries, shared Stripe infrastructure.
 */
// The fields of a provider dispute this service reads.
export interface StripeDisputePayload {
  id?: string;
  amount?: number;
  currency?: string;
  reason?: string;
  status?: string;
  created?: number;
  charge?: string | { id: string } | null;
  payment_intent?: string | { id: string } | null;
  evidence_details?: { due_by?: number | null } | null;
}

// States in which the provider expects nothing more from us.
const CLOSED_DISPUTE_STATUSES: ReadonlySet<string> = new Set([
  'won',
  'lost',
  'warning_closed',
]);

// Answers of the payment provider that refuse a full refund for good: more
// than what is left of the charge (part was refunded by hand), or a charge
// that is disputed or cannot be refunded. Retrying never changes them.
const REFUND_NEEDS_A_PERSON_CODES: ReadonlySet<string> = new Set([
  'amount_too_large',
  'charge_disputed',
  'refund_disputed_payment',
  'charge_not_refundable',
]);

const stripeId = (
  value: string | { id: string } | null | undefined,
): string | undefined => (typeof value === 'string' ? value : value?.id);

@Injectable()
export class MonetizationWebhookService {
  private readonly logger = new Logger(MonetizationWebhookService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeService) private readonly stripeService: StripeService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  private async emitPaymentNotification(params: {
    recipientUserId: string;
    senderUserId: string;
    notice: Notice;
    postId?: string;
    // The Profiles involved, when the payment named them; else each
    // person's first Profile.
    recipientProfileId?: string;
    senderProfileId?: string;
  }) {
    if (!this.eventEmitter) return;
    const [recipientId, senderId] = await Promise.all([
      params.recipientProfileId ??
        primaryProfileIdForUser(this.prisma, params.recipientUserId),
      params.senderProfileId ??
        primaryProfileIdForUser(this.prisma, params.senderUserId),
    ]);
    if (!recipientId) return;
    this.eventEmitter.emit('notification.create', {
      recipientId,
      senderId: senderId ?? undefined,
      type: 'PAYMENT',
      notice: params.notice,
      postId: params.postId,
    } satisfies NotificationCreateEvent['payload']);
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
      const promotionAlert: PaymentAlertEvent['payload'] = {
        eventType: 'Promotion Payment',
        amount,
        currency: session.currency || 'eur',
        description: `Promotion ID: ${promotionId}`,
      };
      this.eventEmitter?.emit('payment.alert', promotionAlert);
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

          // The Profile that earned it: the post's author, while the post
          // exists.
          const post = await tx.post.findUnique({
            where: { id: postId },
            select: { profileId: true },
          });
          await tx.transaction.create({
            data: {
              type: 'DIRECT_POST_UNLOCK',
              amount: amount,
              currency: (session.currency || 'eur').toUpperCase(),
              senderId: clientReferenceId,
              receiverId: creatorId,
              receiverProfileId: post?.profileId ?? null,
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
              ...(await payoutAccountOf(tx, creatorId)),
              lifetimeEarningsCents: Math.floor(amount * CREATOR_SHARE_DECIMAL),
            },
          });
        });
        this.logger.log(
          `Successfully processed Post Unlock for user ${clientReferenceId}`,
        );
        const postUnlockAlert: PaymentAlertEvent['payload'] = {
          eventType: 'Post Unlock',
          amount: amount,
          currency: session.currency || 'eur',
          description: `User ${clientReferenceId} unlocked post ${postId} by creator ${creatorId}`,
          userId: clientReferenceId,
        };
        this.eventEmitter?.emit('payment.alert', postUnlockAlert);
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

          const story = await tx.story.findUnique({
            where: { id: storyId },
            select: { profileId: true },
          });
          await tx.transaction.create({
            data: {
              type: 'DIRECT_STORY_UNLOCK',
              amount,
              currency: (session.currency || 'eur').toUpperCase(),
              senderId: clientReferenceId,
              receiverId: creatorId,
              receiverProfileId: story?.profileId ?? null,
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
              ...(await payoutAccountOf(tx, creatorId)),
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
        // The message can be gone by the time the buyer pays: its sender
        // deleted it, or their account was erased and took it along, while
        // the checkout was open. Nothing can be unlocked then, so the buyer
        // gets the money back.
        const message = await this.prisma.message.findUnique({
          where: { id: messageId },
          select: { id: true, isDeleted: true, senderId: true },
        });
        if (!message || message.isDeleted) {
          await this.refundUnlockOfMissingMessage(session, {
            buyerId: clientReferenceId,
            creatorId,
            messageId,
            amount,
          });
          return;
        }

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
              // The Profile that sent the paid message.
              receiverProfileId: message.senderId,
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
              ...(await payoutAccountOf(tx, creatorId)),
              lifetimeEarningsCents: Math.floor(amount * CREATOR_SHARE_DECIMAL),
            },
          });
        });

        await this.emitPaymentNotification({
          recipientUserId: creatorId,
          senderUserId: clientReferenceId,
          notice: {
            key: 'message_unlocked',
            amountCents: amount,
            currency: session.currency || 'eur',
          },
        });
      }
    } else if (metadata?.type === 'DIRECT_TIP') {
      const clientReferenceId = session.client_reference_id;
      const { creatorId, postId, profileId, senderProfileId } = metadata;
      const amount = session.amount_total || 0;
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.id;

      if (clientReferenceId && creatorId) {
        // The Profile tipped, while it still exists: one deleted since the
        // payment leaves it empty and never loses the record of the payment.
        const tippedProfile = profileId
          ? await this.prisma.profile.findUnique({
              where: { id: profileId },
              select: { id: true },
            })
          : null;
        await this.prisma.$transaction(async (tx) => {
          await tx.transaction.create({
            data: {
              type: 'DIRECT_TIP',
              amount: amount,
              currency: (session.currency || 'eur').toUpperCase(),
              senderId: clientReferenceId,
              receiverId: creatorId,
              receiverProfileId: tippedProfile?.id ?? null,
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
              ...(await payoutAccountOf(tx, creatorId)),
              lifetimeEarningsCents: Math.floor(amount * CREATOR_SHARE_DECIMAL),
            },
          });
        });
        this.logger.log(
          `Successfully processed Tip from user ${clientReferenceId} to ${creatorId}`,
        );
        const tipAlert: PaymentAlertEvent['payload'] = {
          eventType: 'Creator Tip',
          amount: amount,
          currency: session.currency || 'eur',
          description: `User ${clientReferenceId} tipped creator ${creatorId}`,
          userId: clientReferenceId,
        };
        this.eventEmitter?.emit('payment.alert', tipAlert);

        await this.emitPaymentNotification({
          recipientUserId: creatorId,
          senderUserId: clientReferenceId,
          recipientProfileId: tippedProfile?.id,
          senderProfileId: senderProfileId || undefined,
          notice: {
            key: 'tip_received',
            amountCents: amount,
            currency: session.currency || 'eur',
          },
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
        const giftAlert: PaymentAlertEvent['payload'] = {
          eventType: 'Live Gift',
          amount,
          currency: session.currency || 'eur',
          description: `User ${clientReferenceId} gifted ${giftId} on stream ${streamId}`,
          userId: clientReferenceId,
        };
        this.eventEmitter?.emit('payment.alert', giftAlert);
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

  // Records the payment for a message that is deleted or gone and gives it
  // back to the buyer in full. The creator earns nothing from it. A replay
  // of the event finds the payment already refunded and does nothing; a
  // retry after a failed refund asks the provider again with the same key,
  // so the buyer is never refunded twice.
  private async refundUnlockOfMissingMessage(
    session: Stripe.Checkout.Session,
    params: {
      buyerId: string;
      creatorId: string;
      messageId: string;
      amount: number;
    },
  ): Promise<void> {
    const { buyerId, creatorId, messageId, amount } = params;
    const currency = (session.currency || 'eur').toUpperCase();
    const paymentIntentId = stripeId(session.payment_intent);
    const alert = (eventType: string, description: string) => {
      const payload: PaymentAlertEvent['payload'] = {
        eventType,
        amount,
        currency,
        description,
        userId: buyerId,
      };
      this.eventEmitter?.emit('payment.alert', payload);
    };

    if (!paymentIntentId) {
      this.logger.error(
        `Checkout ${session.id} paid for message ${messageId}, which is deleted or gone, and names no payment to refund`,
      );
      alert(
        'Message Unlock Refund Needed',
        `Message ${messageId} is deleted or gone and checkout ${session.id} names no payment: refund the buyer by hand`,
      );
      return;
    }

    let payment = await this.prisma.transaction.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { id: true, status: true },
    });
    if (payment?.status === 'REFUNDED') {
      return;
    }
    // A payment recorded another way, such as an unlock that was paid to
    // the creator before the message was erased: refunding it now is a
    // decision for a person, not for a replayed notice.
    if (payment && payment.status !== 'PENDING') {
      this.logger.warn(
        `Checkout ${session.id} for message ${messageId}, which is deleted or gone, matches Transaction ${payment.id} in state ${payment.status}; not refunded`,
      );
      alert(
        'Message Unlock Refund Review',
        `Message ${messageId} is deleted or gone; checkout ${session.id} matches Transaction ${payment.id} in state ${payment.status}, so it was not refunded. Decide by hand`,
      );
      return;
    }
    if (!payment) {
      // Either person may have been erased since: the payment is kept
      // without them rather than lost.
      const [buyer, creator] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: buyerId },
          select: { id: true },
        }),
        this.prisma.user.findUnique({
          where: { id: creatorId },
          select: { id: true },
        }),
      ]);
      payment = await this.prisma.transaction.create({
        data: {
          type: 'DIRECT_MESSAGE_UNLOCK',
          amount,
          currency,
          senderId: buyer?.id ?? null,
          receiverId: creator?.id ?? null,
          messageId: null,
          stripePaymentIntentId: paymentIntentId,
          // Refunded below; until then the payment is not the creator's.
          status: 'PENDING',
          description: `Direct Message Unlock refunded, the message is deleted or gone (Intent: ${paymentIntentId})`,
        },
        select: { id: true, status: true },
      });
    }

    try {
      await this.stripeService.refundDestinationCharge({
        paymentIntentId,
        amountInCents: amount,
        idempotencyKey: `message-unlock-refund-${session.id}`,
        metadata: {
          type: 'DIRECT_MESSAGE_UNLOCK',
          reason: 'message_no_longer_exists',
          checkoutSessionId: session.id,
        },
      });
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? (err as { code: unknown }).code
          : undefined;
      // Refunded already, by staff or by an earlier attempt whose key the
      // provider no longer keeps: the money is back with the buyer, and the
      // payment is marked refunded below.
      const alreadyRefunded = code === 'charge_already_refunded';
      if (
        !alreadyRefunded &&
        typeof code === 'string' &&
        REFUND_NEEDS_A_PERSON_CODES.has(code)
      ) {
        // The provider will never take a full refund of this payment: part
        // of it was refunded by hand, or it is disputed. Asking again would
        // fail the same way, so the notice is answered and a person
        // finishes it. The payment stays PENDING, never counted as the
        // creator's; the provider's refund notice marks it refunded once
        // the rest is given back.
        await this.prisma.transaction.update({
          where: { id: payment.id },
          data: {
            description: `Direct Message Unlock, the message is deleted or gone; full refund refused (${code}), refund by hand (Intent: ${paymentIntentId})`,
          },
        });
        alert(
          'Message Unlock Refund Needed',
          `Message ${messageId} is deleted or gone; the provider refused the full refund of checkout ${session.id} (${code}). Refund the rest to the buyer by hand`,
        );
        return;
      }
      if (!alreadyRefunded) {
        alert(
          'Message Unlock Refund Failed',
          `Message ${messageId} is deleted or gone; refunding checkout ${session.id} failed and is retried. Refund the buyer by hand if it keeps failing`,
        );
        throw err;
      }
    }

    await this.prisma.transaction.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED' },
    });
    this.logger.log(
      `Refunded checkout ${session.id}: message ${messageId} is deleted or gone`,
    );
    alert(
      'Message Unlock Refunded',
      `Message ${messageId} is deleted or gone; buyer ${buyerId} refunded in full, creator ${creatorId} earns nothing (checkout ${session.id})`,
    );
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

  // Mirrors a dispute as the payment provider reports it: created, updated
  // or closed. One row per dispute; the provider stays the source of truth.
  // `findCustomerId` reads who was charged from the provider; it is asked
  // only when the account that paid is not known any other way.
  async syncDispute(
    dispute: StripeDisputePayload,
    findCustomerId?: () => Promise<string | undefined>,
  ): Promise<void> {
    if (!dispute?.id || typeof dispute.amount !== 'number') {
      this.logger.warn('Dispute webhook missing the dispute id or amount');
      return;
    }

    const existing = await this.prisma.paymentDispute.findUnique({
      where: { stripeDisputeId: dispute.id },
      select: { status: true, userId: true },
    });
    const status = dispute.status ?? 'unknown';
    const closed = CLOSED_DISPUTE_STATUSES.has(status);
    // Webhooks can arrive out of order: an older update must not reopen a
    // dispute the provider has already closed.
    if (existing && CLOSED_DISPUTE_STATUSES.has(existing.status) && !closed) {
      return;
    }

    const paymentIntentId = stripeId(dispute.payment_intent);
    const transaction = paymentIntentId
      ? await this.prisma.transaction.findUnique({
          where: { stripePaymentIntentId: paymentIntentId },
          select: { id: true, senderId: true },
        })
      : null;
    const dueBy = dispute.evidence_details?.due_by;
    const userId =
      transaction?.senderId ??
      existing?.userId ??
      (await this.accountOfCustomer(await findCustomerId?.()));

    const data = {
      stripeChargeId: stripeId(dispute.charge) ?? null,
      stripePaymentIntentId: paymentIntentId ?? null,
      transactionId: transaction?.id ?? null,
      // An account that is known is never emptied by a later notice.
      ...(userId && { userId }),
      amountCents: dispute.amount,
      currency: (dispute.currency ?? 'eur').toUpperCase(),
      reason: dispute.reason ?? 'general',
      status,
      evidenceDueBy: !closed && dueBy ? new Date(dueBy * 1000) : null,
      closedAt: closed ? new Date() : null,
    };

    await this.prisma.paymentDispute.upsert({
      where: { stripeDisputeId: dispute.id },
      create: {
        stripeDisputeId: dispute.id,
        openedAt: dispute.created
          ? new Date(dispute.created * 1000)
          : new Date(),
        ...data,
      },
      update: data,
    });
  }

  private async accountOfCustomer(
    customerId: string | undefined,
  ): Promise<string | undefined> {
    if (!customerId) return undefined;
    const user = await this.prisma.user.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    return user?.id;
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
      select: { id: true, monetization: { select: { profileId: true } } },
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
        // The Profile holding the account that paid it out.
        profileId: user.monetization?.profileId ?? null,
        amountCents: payout.amount ?? 0,
        currency,
        status,
        arrivalDate,
        failureReason,
      },
      update: {
        profileId: user.monetization?.profileId ?? null,
        amountCents: payout.amount ?? 0,
        currency,
        status,
        arrivalDate,
        failureReason,
      },
    });
  }

  async handleAccountUpdated(
    account: {
      id: string;
      charges_enabled?: boolean;
      capabilities?: { transfers?: string };
    } & ConnectAccountCompanyFields,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { stripeConnectAccountId: account.id },
      select: { id: true },
    });
    if (user) {
      const { transfersEnabled, chargesEnabled } =
        deriveConnectAccountFlags(account);
      const verifiedCompany = isVerifiedCompanyAccount(account);
      await this.prisma.monetization.upsert({
        where: { userId: user.id },
        update: {
          transfersEnabled,
          chargesEnabled,
          verifiedCompany,
          stripeConnectAccountId: account.id,
        },
        create: {
          userId: user.id,
          ...(await payoutAccountOf(this.prisma, user.id)),
          stripeConnectAccountId: account.id,
          transfersEnabled,
          chargesEnabled,
          verifiedCompany,
        },
      });
    }
  }
}
