import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AdminAction, type MonetizationStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 20;

// What staff read of an application.
const APPLICATION_SELECT = {
  id: true,
  username: true,
  fullName: true,
  avatar: true,
  accountType: true,
  createdAt: true,
  isAccountBanned: true,
  suspendedUntil: true,
  monetizationStatus: true,
  monetizationAppliedAt: true,
  monetizationPitch: true,
  monetizationReviewedAt: true,
  monetizationReviewedBy: true,
  monetizationNote: true,
  _count: { select: { followers: true, posts: true } },
} as const;

type Decision = {
  from: MonetizationStatus;
  to: MonetizationStatus;
  action: AdminAction;
  needsNote: boolean;
};

// Each decision staff can take, and the status it starts from.
const DECISIONS = {
  approve: {
    from: 'PENDING',
    to: 'APPROVED',
    action: AdminAction.MONETIZATION_APPROVED,
    needsNote: false,
  },
  reject: {
    from: 'PENDING',
    to: 'REJECTED',
    action: AdminAction.MONETIZATION_REJECTED,
    needsNote: true,
  },
  revoke: {
    from: 'APPROVED',
    to: 'REVOKED',
    action: AdminAction.MONETIZATION_REVOKED,
    needsNote: true,
  },
} as const satisfies Record<string, Decision>;

export type MonetizationDecision = keyof typeof DECISIONS;

// The monetization programme, as staff run it: they read applications and
// approve, refuse or revoke them. Each decision and its audit entry are
// written together, and only from the status it starts from, so two staff
// deciding at once cannot both win.
@Injectable()
export class AdminMonetizationProgrammeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(status: MonetizationStatus = 'PENDING', page = 1) {
    const current = Math.max(1, Math.floor(page) || 1);
    const where = { monetizationStatus: status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.profile.findMany({
        where,
        select: APPLICATION_SELECT,
        // Oldest application first: none waits behind newer ones.
        orderBy: [{ monetizationAppliedAt: 'asc' }, { id: 'asc' }],
        take: PAGE_SIZE,
        skip: (current - 1) * PAGE_SIZE,
      }),
      this.prisma.profile.count({ where }),
    ]);
    return {
      items,
      total,
      page: current,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  async decide(
    adminId: string,
    profileId: string,
    decision: MonetizationDecision,
    note?: string,
  ) {
    const step: Decision = DECISIONS[decision];
    const reason = note?.trim() || null;
    if (step.needsNote && !reason) {
      throw AppException.BadRequest(
        ErrorCode.BAD_REQUEST,
        'A reason is needed for the creator.',
      );
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.profile.updateMany({
        where: { id: profileId, monetizationStatus: step.from },
        data: {
          monetizationStatus: step.to,
          monetizationReviewedAt: now,
          monetizationReviewedBy: adminId,
          monetizationNote: reason,
        },
      });
      if (count === 0) {
        // Nothing changed, so nothing is recorded.
        throw AppException.Conflict(
          ErrorCode.MONETIZATION_REVIEW_NOT_ALLOWED,
          `Only a ${step.from} application can be ${decision}d.`,
        );
      }
      await tx.adminAuditLog.create({
        data: {
          adminId,
          action: step.action,
          targetType: 'profile',
          targetId: profileId,
          details: reason,
        },
      });
    });
    return { success: true, status: step.to };
  }
}
