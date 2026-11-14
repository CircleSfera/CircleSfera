import { ErrorCode, type PaymentAlertEvent } from '@circlesfera/shared';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type Stripe from 'stripe';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Stripe Checkout Session metadata.type values fulfilled here rather than by
// PaymentsService's plan branch. STRIPE_SUBSCRIPTION is dead legacy metadata
// (VIP subscriptions were removed): routed here so it stays a no-op instead
// of falling through to plan checkout processing.
const ONE_TIME_CHECKOUT_TYPES = new Set(['PROMOTION', 'STRIPE_SUBSCRIPTION']);

export function isOneTimeCheckoutType(type: string | undefined): boolean {
  return !!type && ONE_TIME_CHECKOUT_TYPES.has(type);
}

// What a refund notice of the payment provider says of the charge.
export interface StripeRefundedCharge {
  amount?: number;
  amount_refunded?: number;
  payment_intent?: string | { id: string } | null;
}

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

const stripeId = (
  value: string | { id: string } | null | undefined,
): string | undefined => (typeof value === 'string' ? value : value?.id);

/**
 * Owns what the payment provider's notices do to CircleSfera's own one-time
 * sales and to the ledger: a promotion's checkout paid or expired, a refund
 * of a payment, and a dispute of one, a plan invoice's included. Plan
 * subscriptions themselves stay in PaymentsService; both share the one
 * webhook endpoint, its signature check and its idempotency bookkeeping.
 */
@Injectable()
export class PaymentEventsService {
  private readonly logger = new Logger(PaymentEventsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

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
    } else if (metadata?.type === 'STRIPE_SUBSCRIPTION') {
      this.logger.debug('Legacy VIP Subscription event ignored.');
    }

    await this.applyEarlierDisputes(session);
  }

  // A dispute can be reported before the payment it is about is recorded:
  // its notice found no payment then and changed nothing. Once the payment
  // is recorded, each dispute already mirrored for it is tied to it and
  // applied, as its notice would have been.
  private async applyEarlierDisputes(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const paymentIntentId = stripeId(session.payment_intent);
    if (!paymentIntentId) return;
    const disputes = await this.prisma.paymentDispute.findMany({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { stripeDisputeId: true, status: true },
    });
    // The payment is recorded already: a failure here is logged, not
    // thrown, since a replay of the notice could not record it again. The
    // dispute's next notice applies it then.
    try {
      for (const dispute of disputes) {
        await this.applyDisputeToPayment({
          id: dispute.stripeDisputeId,
          payment_intent: paymentIntentId,
          status: dispute.status,
        });
      }
    } catch (err) {
      this.logger.error(
        `Could not apply the disputes reported before payment ${paymentIntentId}: ${String(err)}`,
      );
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

  // A refund of a payment, in part or in full, made by the app or by staff
  // in the provider's Dashboard. The payment keeps what the buyer did not
  // get back; refunded in full, it is REFUNDED. A notice that comes again
  // changes nothing.
  async handleChargeRefunded(charge: StripeRefundedCharge): Promise<void> {
    const paymentIntentId = stripeId(charge.payment_intent);
    const refunded = charge.amount_refunded ?? 0;
    if (!paymentIntentId || refunded <= 0) {
      return;
    }
    const tx = await this.paymentOf(paymentIntentId);
    if (!tx) {
      return;
    }
    // A charge that never completed on our side has nothing to refund.
    // Marking it REFUNDED would misrepresent money that was never captured.
    if (tx.status === 'FAILED') {
      this.logger.warn(
        `Received a refund for Transaction ${tx.id} (paymentIntent ${paymentIntentId}) which is already FAILED. Skipping status transition.`,
      );
      return;
    }

    // The provider's figure is the total refunded so far, and its notices
    // can arrive out of order: an older, lower total never lowers it.
    const full = refunded >= (charge.amount ?? tx.amount);
    const refundedCents = full ? tx.amount : refunded;
    const becomesRefunded = full && tx.status !== 'REFUNDED';
    const data = {
      ...(becomesRefunded && { status: 'REFUNDED' as const }),
      ...(refundedCents > (tx.refundedCents ?? 0) && { refundedCents }),
    };
    if (Object.keys(data).length > 0) {
      await this.prisma.transaction.update({ where: { id: tx.id }, data });
    }
  }

  // What a dispute does to its payment, once the dispute is mirrored. Open,
  // the payment is held: it counts nowhere. Won, it counts again. Lost, it
  // is REFUNDED. An inquiry, which the bank opens before any dispute,
  // changes nothing. The mirrored row holds the latest state, so a notice
  // arriving late never reopens a closed dispute.
  async applyDisputeToPayment(dispute: StripeDisputePayload): Promise<void> {
    const paymentIntentId = stripeId(dispute.payment_intent);
    if (!dispute?.id || !paymentIntentId) {
      return;
    }
    const mirrored = await this.prisma.paymentDispute.findUnique({
      where: { stripeDisputeId: dispute.id },
      select: { status: true },
    });
    const status = mirrored?.status ?? dispute.status ?? '';
    if (status.startsWith('warning_')) {
      return;
    }
    const tx = await this.paymentOf(paymentIntentId);
    if (!tx) {
      return;
    }
    // A dispute mirrored before its payment was recorded is tied to it now.
    await this.prisma.paymentDispute.updateMany({
      where: { stripeDisputeId: dispute.id, transactionId: null },
      data: { transactionId: tx.id },
    });

    if (status === 'won') {
      await this.prisma.transaction.updateMany({
        where: { id: tx.id, status: 'DISPUTED' },
        data: { status: 'COMPLETED' },
      });
      return;
    }

    if (status === 'lost') {
      if (tx.status !== 'REFUNDED' && tx.status !== 'FAILED') {
        await this.prisma.transaction.update({
          where: { id: tx.id },
          data: { status: 'REFUNDED' },
        });
      }
      return;
    }

    await this.prisma.transaction.updateMany({
      where: { id: tx.id, status: 'COMPLETED' },
      data: { status: 'DISPUTED' },
    });
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

  // The payment a provider payment intent made, with what a refund or a
  // dispute needs of it.
  private paymentOf(paymentIntentId: string) {
    return this.prisma.transaction.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
      select: {
        id: true,
        status: true,
        amount: true,
        refundedCents: true,
      },
    });
  }
}
