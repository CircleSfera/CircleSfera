import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MonetizationWebhookService } from './monetization-webhook.service.js';

// Disputes mirrored from the payment provider: one row per dispute, kept in
// step with what the provider reports.
describe('MonetizationWebhookService: disputes', () => {
  const prisma = {
    paymentDispute: { findUnique: vi.fn(), upsert: vi.fn() },
    transaction: { findUnique: vi.fn() },
  };
  let service: MonetizationWebhookService;

  const dispute = {
    id: 'dp_1',
    amount: 1999,
    currency: 'eur',
    reason: 'fraudulent',
    status: 'needs_response',
    created: 1_790_000_000,
    charge: 'ch_1',
    payment_intent: { id: 'pi_1' },
    evidence_details: { due_by: 1_790_600_000 },
  };
  const saved = () => prisma.paymentDispute.upsert.mock.calls[0][0];

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.paymentDispute.findUnique.mockResolvedValue(null);
    prisma.transaction.findUnique.mockResolvedValue({ id: 'tx_1' });
    service = new MonetizationWebhookService(prisma as never);
  });

  it('stores a new dispute with its amount in cents, reason, state and due day', async () => {
    await service.syncDispute(dispute);

    expect(prisma.transaction.findUnique).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: 'pi_1' },
      select: { id: true },
    });
    expect(saved().where).toEqual({ stripeDisputeId: 'dp_1' });
    expect(saved().create).toEqual({
      stripeDisputeId: 'dp_1',
      openedAt: new Date(1_790_000_000 * 1000),
      stripeChargeId: 'ch_1',
      stripePaymentIntentId: 'pi_1',
      transactionId: 'tx_1',
      amountCents: 1999,
      currency: 'EUR',
      reason: 'fraudulent',
      status: 'needs_response',
      evidenceDueBy: new Date(1_790_600_000 * 1000),
      closedAt: null,
    });
  });

  it('keeps a dispute whose payment has no Transaction', async () => {
    prisma.transaction.findUnique.mockResolvedValue(null);

    await service.syncDispute(dispute);

    expect(saved().create.transactionId).toBeNull();
    expect(saved().create.stripePaymentIntentId).toBe('pi_1');
  });

  it('updates the same row when the provider reports a change', async () => {
    prisma.paymentDispute.findUnique.mockResolvedValue({
      status: 'needs_response',
    });

    await service.syncDispute({ ...dispute, status: 'under_review' });

    expect(saved().update.status).toBe('under_review');
    expect(saved().update).not.toHaveProperty('openedAt');
  });

  it('closes a dispute: no due day any more and the closing time set', async () => {
    await service.syncDispute({ ...dispute, status: 'lost' });

    expect(saved().update.status).toBe('lost');
    expect(saved().update.evidenceDueBy).toBeNull();
    expect(saved().update.closedAt).toBeInstanceOf(Date);
  });

  it('does not reopen a closed dispute when an older update arrives late', async () => {
    prisma.paymentDispute.findUnique.mockResolvedValue({ status: 'won' });

    await service.syncDispute({ ...dispute, status: 'needs_response' });

    expect(prisma.paymentDispute.upsert).not.toHaveBeenCalled();
  });

  it('ignores a payload without a dispute id or an amount', async () => {
    await service.syncDispute({ status: 'needs_response' });
    await service.syncDispute({ id: 'dp_2' });

    expect(prisma.paymentDispute.upsert).not.toHaveBeenCalled();
  });
});
