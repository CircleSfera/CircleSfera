import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MonetizationWebhookService } from './monetization-webhook.service.js';

// A payment of €10.00 to a creator for a post.
const PAYMENT = {
  id: 'tx_1',
  type: 'DIRECT_POST_UNLOCK',
  status: 'COMPLETED',
  amount: 1000,
  vatCents: 174,
  refundedCents: 0,
  senderId: 'buyer1',
  postId: 'post1',
  storyId: null,
  messageId: null,
};

describe('MonetizationWebhookService: refunds and disputes', () => {
  const prisma = {
    transaction: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    paymentDispute: { findUnique: vi.fn() },
    postUnlock: { deleteMany: vi.fn() },
    storyUnlock: { deleteMany: vi.fn() },
    messageUnlock: { deleteMany: vi.fn() },
  };
  // The payment provider is never asked: a refund or a dispute only
  // changes what the payment counts.
  const stripe = {};
  let service: MonetizationWebhookService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.transaction.findUnique.mockResolvedValue({ ...PAYMENT });
    prisma.paymentDispute.findUnique.mockResolvedValue(null);
    service = new MonetizationWebhookService(prisma as never, stripe as never);
  });

  describe('handleChargeRefunded', () => {
    const refund = (amount_refunded: number) =>
      service.handleChargeRefunded({
        payment_intent: { id: 'pi_1' },
        amount: 1000,
        amount_refunded,
      });

    it('keeps a payment refunded in part, recording what the buyer got back', async () => {
      await refund(500);

      expect(prisma.transaction.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { stripePaymentIntentId: 'pi_1' } }),
      );
      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx_1' },
        data: { refundedCents: 500 },
      });
      expect(prisma.postUnlock.deleteMany).not.toHaveBeenCalled();
    });

    it('records the refunded total, not a sum, when more of the payment is refunded', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...PAYMENT,
        refundedCents: 300,
      });

      await refund(500);

      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx_1' },
        data: { refundedCents: 500 },
      });
    });

    it('never lowers what was refunded when an older notice arrives after a later one', async () => {
      let stored = { ...PAYMENT };
      prisma.transaction.findUnique.mockImplementation(() =>
        Promise.resolve({ ...stored }),
      );
      prisma.transaction.update.mockImplementation(({ data }) => {
        stored = { ...stored, ...data };
        return Promise.resolve(stored);
      });

      await refund(500);
      await refund(300);

      expect(stored.refundedCents).toBe(500);
      expect(prisma.transaction.update).toHaveBeenCalledTimes(1);
    });

    it('keeps the full refund of a payment refunded in full when an older partial notice arrives', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...PAYMENT,
        status: 'REFUNDED',
        refundedCents: 1000,
      });

      await refund(300);

      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('records the refunded part of a payment whose lost dispute already refunded it, without removing access again', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...PAYMENT,
        status: 'REFUNDED',
      });

      await refund(300);

      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx_1' },
        data: { refundedCents: 300 },
      });
      expect(prisma.postUnlock.deleteMany).not.toHaveBeenCalled();
    });

    it('writes nothing again for a partial refund it already knows', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...PAYMENT,
        refundedCents: 500,
      });

      await refund(500);

      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('marks a payment refunded in full and removes what the buyer bought', async () => {
      await refund(1000);

      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx_1' },
        data: { status: 'REFUNDED', refundedCents: 1000 },
      });
      expect(prisma.postUnlock.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'buyer1', postId: 'post1' },
      });
    });

    it('takes a full refund from what the payment recorded when the notice leaves out the charge', async () => {
      await service.handleChargeRefunded({
        payment_intent: 'pi_1',
        amount_refunded: 1000,
      });

      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx_1' },
        data: { status: 'REFUNDED', refundedCents: 1000 },
      });
    });

    it('removes a story bought and refunded in full', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...PAYMENT,
        type: 'DIRECT_STORY_UNLOCK',
        postId: null,
        storyId: 'story1',
      });

      await refund(1000);

      expect(prisma.storyUnlock.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'buyer1', storyId: 'story1' },
      });
      expect(prisma.postUnlock.deleteMany).not.toHaveBeenCalled();
    });

    it('removes a message bought and refunded in full', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...PAYMENT,
        type: 'DIRECT_MESSAGE_UNLOCK',
        postId: null,
        messageId: 'msg1',
      });

      await refund(1000);

      expect(prisma.messageUnlock.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'buyer1', messageId: 'msg1' },
      });
      expect(prisma.postUnlock.deleteMany).not.toHaveBeenCalled();
    });

    it('marks refunded a payment held by a dispute, or one never completed, when refunded in full', async () => {
      for (const status of ['DISPUTED', 'PENDING']) {
        prisma.transaction.findUnique.mockResolvedValue({
          ...PAYMENT,
          status,
        });
        await refund(1000);
      }

      expect(prisma.transaction.update).toHaveBeenCalledTimes(2);
      expect(prisma.transaction.update).toHaveBeenLastCalledWith({
        where: { id: 'tx_1' },
        data: { status: 'REFUNDED', refundedCents: 1000 },
      });
    });

    it('changes nothing for a payment already marked refunded', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...PAYMENT,
        status: 'REFUNDED',
        refundedCents: 1000,
      });

      await refund(1000);

      expect(prisma.transaction.update).not.toHaveBeenCalled();
      expect(prisma.postUnlock.deleteMany).not.toHaveBeenCalled();
    });

    it('leaves a failed payment as it is', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...PAYMENT,
        status: 'FAILED',
      });

      await refund(1000);

      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('does nothing for a notice with no payment, nothing refunded or an unknown payment', async () => {
      await service.handleChargeRefunded({ amount_refunded: 500 });
      await service.handleChargeRefunded({ payment_intent: 'pi_1' });
      expect(prisma.transaction.findUnique).not.toHaveBeenCalled();

      prisma.transaction.findUnique.mockResolvedValue(null);
      await refund(500);

      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });
  });

  describe('applyDisputeToPayment', () => {
    const dispute = (status: string) =>
      service.applyDisputeToPayment({
        id: 'dp_1',
        amount: 1000,
        status,
        payment_intent: 'pi_1',
      });

    it('changes nothing for an inquiry, before any dispute', async () => {
      await dispute('warning_needs_response');
      await dispute('warning_closed');

      expect(prisma.transaction.findUnique).not.toHaveBeenCalled();
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    });

    it.each(['needs_response', 'under_review'])(
      'holds a completed payment while its dispute is %s, and the buyer keeps what they bought',
      async (status) => {
        await dispute(status);

        expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
          where: { id: 'tx_1', status: 'COMPLETED' },
          data: { status: 'DISPUTED' },
        });
        expect(prisma.postUnlock.deleteMany).not.toHaveBeenCalled();
      },
    );

    it('counts a held payment again when the dispute is won', async () => {
      await dispute('won');

      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 'tx_1', status: 'DISPUTED' },
        data: { status: 'COMPLETED' },
      });
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('never holds again a payment whose dispute was already won, when an older notice arrives late', async () => {
      prisma.paymentDispute.findUnique.mockResolvedValue({ status: 'won' });

      await dispute('under_review');

      expect(prisma.paymentDispute.findUnique).toHaveBeenCalledWith({
        where: { stripeDisputeId: 'dp_1' },
        select: { status: true },
      });
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 'tx_1', status: 'DISPUTED' },
        data: { status: 'COMPLETED' },
      });
    });

    it('refunds a payment whose dispute is lost and removes what the buyer bought', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...PAYMENT,
        status: 'DISPUTED',
      });

      await dispute('lost');

      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx_1' },
        data: { status: 'REFUNDED' },
      });
      expect(prisma.postUnlock.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'buyer1', postId: 'post1' },
      });
    });

    it('removes a message bought when its dispute is lost', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...PAYMENT,
        type: 'DIRECT_MESSAGE_UNLOCK',
        status: 'DISPUTED',
        postId: null,
        messageId: 'msg1',
      });

      await dispute('lost');

      expect(prisma.messageUnlock.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'buyer1', messageId: 'msg1' },
      });
    });

    it('writes nothing again for a lost dispute already recorded, nor for a failed payment', async () => {
      for (const status of ['REFUNDED', 'FAILED']) {
        prisma.transaction.findUnique.mockResolvedValue({
          ...PAYMENT,
          status,
        });
        await dispute('lost');
      }

      expect(prisma.transaction.update).not.toHaveBeenCalled();
      expect(prisma.postUnlock.deleteMany).not.toHaveBeenCalled();
    });

    it('does nothing for a dispute with no id, no payment or an unknown payment', async () => {
      await service.applyDisputeToPayment({ payment_intent: 'pi_1' });
      await service.applyDisputeToPayment({ id: 'dp_1' });
      expect(prisma.transaction.findUnique).not.toHaveBeenCalled();

      prisma.transaction.findUnique.mockResolvedValue(null);
      await service.applyDisputeToPayment({
        id: 'dp_1',
        payment_intent: 'pi_1',
      });

      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    });

    it('holds the payment of a dispute that names no state yet', async () => {
      await service.applyDisputeToPayment({
        id: 'dp_1',
        payment_intent: 'pi_1',
      });

      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 'tx_1', status: 'COMPLETED' },
        data: { status: 'DISPUTED' },
      });
    });
  });
});
