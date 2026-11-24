import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { PLAN_FEATURE_KEYS } from '../common/constants/plan-features.constants.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdatePlanDto } from './dto/update-plan.dto.js';

const PLAN_FIELDS = {
  id: true,
  name: true,
  description: true,
  priceCents: true,
  yearlyPriceCents: true,
  currency: true,
  interval: true,
  features: true,
  isActive: true,
  updatedAt: true,
} as const;

// The plan catalogue for staff: what each platform plan includes and whether
// it is on sale. Prices are shown and never changed here.
@Injectable()
export class AdminPlansService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getPlans() {
    const plans = await this.prisma.platformPlan.findMany({
      select: PLAN_FIELDS,
      orderBy: { priceCents: 'asc' },
    });
    return { plans, featureKeys: PLAN_FEATURE_KEYS };
  }

  async updatePlan(adminId: string, id: string, dto: UpdatePlanDto) {
    const data = { isActive: dto.isActive };

    const before = await this.prisma.platformPlan.findUnique({
      where: { id },
      select: PLAN_FIELDS,
    });
    if (!before) throw new NotFoundException('Plan not found');

    const [plan] = await this.prisma.$transaction([
      this.prisma.platformPlan.update({
        where: { id },
        data,
        select: PLAN_FIELDS,
      }),
      this.prisma.adminAuditLog.create({
        data: {
          adminId,
          action: AdminAction.UPDATE_SETTINGS,
          targetType: 'PLATFORM_PLAN',
          targetId: id,
          details: JSON.stringify({
            before: { isActive: before.isActive },
            after: data,
          }),
        },
      }),
    ]);
    return plan;
  }
}
