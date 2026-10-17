import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewPromotionUseCase } from './review-promotion.use-case.js';

describe('ReviewPromotionUseCase', () => {
  const prisma = {
    promotion: { findUnique: vi.fn(), update: vi.fn() },
    profile: { findFirst: vi.fn() },
    adminIdentity: { findUnique: vi.fn() },
  };
  const notifications = { create: vi.fn() };
  const log = { execute: vi.fn() };
  const refund = { execute: vi.fn() };
  let useCase: ReviewPromotionUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.promotion.findUnique.mockResolvedValue({
      id: 'promo-1',
      userId: 'owner',
      status: 'PENDING',
      chargedAt: new Date(),
      targetType: 'POST',
      targetId: 'post-1',
    });
    prisma.promotion.update.mockImplementation(({ data }) => ({
      id: 'promo-1',
      ...data,
    }));
    prisma.profile.findFirst.mockResolvedValue({ id: 'profile-owner' });
    prisma.adminIdentity.findUnique.mockResolvedValue(null);
    useCase = new ReviewPromotionUseCase(
      prisma as never,
      notifications as never,
      log as never,
      refund as never,
    );
  });

  it('keeps the reason of a rejection and tells it about the promotion', async () => {
    await useCase.execute(
      'admin-1',
      'promo-1',
      'REJECTED' as never,
      'Misleading',
    );

    expect(refund.execute).toHaveBeenCalledWith('promo-1', 'admin-reject');
    expect(prisma.promotion.update).toHaveBeenCalledWith({
      where: { id: 'promo-1' },
      data: { status: 'REJECTED', rejectionReason: 'Misleading' },
    });
    const notice = notifications.create.mock.calls[0][0];
    expect(notice).toMatchObject({
      recipientId: 'profile-owner',
      notice: { key: 'promotion_rejected', note: 'Misleading' },
      targetType: 'promotion_rejected',
      targetId: 'promo-1',
    });
    // Not about a post: it is not appealed as a post removed.
    expect(notice.postId).toBeUndefined();
  });

  it('clears any reason when it is approved', async () => {
    await useCase.execute('admin-1', 'promo-1', 'ACTIVE' as never);

    expect(refund.execute).not.toHaveBeenCalled();
    expect(prisma.promotion.update).toHaveBeenCalledWith({
      where: { id: 'promo-1' },
      data: { status: 'ACTIVE', rejectionReason: null },
    });
    expect(notifications.create.mock.calls[0][0]).toMatchObject({
      notice: { key: 'promotion_approved' },
      targetType: 'promotion_approved',
      targetId: 'promo-1',
    });
  });
});
