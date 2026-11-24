import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPlansService } from './admin-plans.service.js';

// The plan catalogue for staff: reading it, changing what a plan includes,
// and the audit entry every change leaves.
describe('AdminPlansService', () => {
  const prisma = {
    platformPlan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn((args: unknown) => args),
    },
    adminAuditLog: { create: vi.fn((args: unknown) => args) },
    $transaction: vi.fn(async (operations: unknown[]) => operations),
  };
  let service: AdminPlansService;

  const plan = {
    id: 'plan-1',
    name: 'Premium',
    description: 'The verified badge',
    priceCents: 999,
    yearlyPriceCents: 9990,
    currency: 'EUR',
    interval: 'month',
    features: ['verified_badge'],
    isActive: true,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminPlansService(prisma as never);
  });

  it('lists every plan, inactive ones included, with the features that exist', async () => {
    prisma.platformPlan.findMany.mockResolvedValue([plan]);

    const result = await service.getPlans();

    expect(prisma.platformPlan.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: expect.anything() }),
    );
    expect(result.plans).toEqual([plan]);
    expect(result.featureKeys).toEqual([
      'verified_badge',
      'priority_support',
      'no_promoted_content',
      'advanced_analytics',
      'team_access',
      'studio_pro',
    ]);
  });

  it('never reads or returns the Stripe identifiers', async () => {
    prisma.platformPlan.findMany.mockResolvedValue([plan]);

    await service.getPlans();

    const { select } = prisma.platformPlan.findMany.mock.calls[0][0];
    expect(Object.keys(select)).not.toEqual(
      expect.arrayContaining([
        'stripeProductId',
        'stripePriceId',
        'yearlyStripePriceId',
      ]),
    );
  });

  it('takes a plan off sale, and audits before and after', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(plan);

    await service.updatePlan('admin-1', 'plan-1', { isActive: false });

    expect(prisma.platformPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plan-1' },
        data: { isActive: false },
      }),
    );
    const audit = prisma.adminAuditLog.create.mock.calls[0][0] as {
      data: { adminId: string; targetType: string; details: string };
    };
    expect(audit.data).toEqual(
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'UPDATE_SETTINGS',
        targetType: 'PLATFORM_PLAN',
        targetId: 'plan-1',
      }),
    );
    expect(JSON.parse(audit.data.details)).toEqual({
      before: { isActive: true },
      after: { isActive: false },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it("never writes what the plan includes or its description: those are the catalog's", async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(plan);

    await service.updatePlan('admin-1', 'plan-1', {
      isActive: true,
      features: ['advanced_analytics'],
      description: 'Another text',
    } as never);

    expect(prisma.platformPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } }),
    );
  });

  it('never writes a price, however the request is shaped', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(plan);

    await service.updatePlan('admin-1', 'plan-1', {
      isActive: true,
      priceCents: 1,
      stripePriceId: 'price_other',
    } as never);

    expect(prisma.platformPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } }),
    );
  });

  it('answers not found for a plan that does not exist', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(null);

    await expect(
      service.updatePlan('admin-1', 'missing', { isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});
