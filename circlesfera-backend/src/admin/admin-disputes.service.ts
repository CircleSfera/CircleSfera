import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

// Disputes mirrored from the payment provider, for staff. Read only: a
// dispute is answered in the provider.
@Injectable()
export class AdminDisputesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getDisputes(page = 1, limit = 20, state?: 'open' | 'closed') {
    const open: Prisma.PaymentDisputeWhereInput = { closedAt: null };
    const where: Prisma.PaymentDisputeWhereInput =
      state === 'open'
        ? open
        : state === 'closed'
          ? { closedAt: { not: null } }
          : {};

    const [disputes, total, openCount] = await Promise.all([
      this.prisma.paymentDispute.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        // Open ones first, the one due soonest on top; then the newest.
        orderBy: [
          { closedAt: { sort: 'desc', nulls: 'first' } },
          { evidenceDueBy: { sort: 'asc', nulls: 'last' } },
          { openedAt: 'desc' },
        ],
        select: {
          id: true,
          stripeDisputeId: true,
          amountCents: true,
          currency: true,
          reason: true,
          status: true,
          evidenceDueBy: true,
          openedAt: true,
          closedAt: true,
          transaction: {
            select: {
              id: true,
              type: true,
              sender: { select: { id: true, email: true } },
            },
          },
        },
      }),
      this.prisma.paymentDispute.count({ where }),
      this.prisma.paymentDispute.count({ where: open }),
    ]);

    return {
      data: disputes,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        openCount,
      },
    };
  }
}
