import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import {
  AdminAction,
  FoundingCreatorStatus,
  type Prisma,
} from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import { assertRealMoneyAllowed } from '../common/policies/test-account.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DecideFoundingCreatorDto } from './dto/decide-founding-creator.dto.js';

const QUEUE_PAGE = 50;

// What staff see of an application.
const STAFF_SELECT = {
  id: true,
  status: true,
  links: true,
  city: true,
  note: true,
  createdAt: true,
  decidedAt: true,
  declineReason: true,
  declineNote: true,
  platformSubscriptionId: true,
  profile: {
    select: {
      id: true,
      username: true,
      accountType: true,
      verificationLevel: true,
      user: { select: { identityVerifiedAt: true } },
    },
  },
} satisfies Prisma.FoundingCreatorApplicationSelect;

// A Profile that can be made a founding creator now: not banned nor
// suspended, of an account that is active, not banned, and not closed or
// waiting to be deleted.
export function decidableProfileWhere(now: Date): Prisma.ProfileWhereInput {
  return {
    isAccountBanned: false,
    OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }],
    user: {
      isActive: true,
      isRootBanned: false,
      deletedAt: null,
      scheduledDeletionAt: null,
    },
  };
}

// Staff with the founding-creators permission decide on applications in the
// Backoffice. Every decision is recorded in the staff audit log, with the
// application; who decided is never shown to the person. An approval gives
// nothing by itself: the person starts the free year from the app,
// accepting its terms.
@Injectable()
export class FoundingCreatorsReviewService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // The applications waiting, oldest first; those of a suspended Profile or
  // account, or of an account being deleted, are left out until that ends.
  async queue() {
    const where = {
      status: FoundingCreatorStatus.PENDING,
      profile: decidableProfileWhere(new Date()),
    };
    const [items, total] = await Promise.all([
      this.prisma.foundingCreatorApplication.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: QUEUE_PAGE,
        select: STAFF_SELECT,
      }),
      this.prisma.foundingCreatorApplication.count({ where }),
    ]);
    return { items, total };
  }

  // Approves or declines a waiting application. An approval is refused, with
  // nothing recorded, for a Test Account where money is real, and for a
  // Profile or account suspended or being deleted. A decline is always
  // possible.
  async decide(adminId: string, id: string, dto: DecideFoundingCreatorDto) {
    const waiting = await this.prisma.foundingCreatorApplication.findFirst({
      where: { id, status: FoundingCreatorStatus.PENDING },
      select: { profileId: true, profile: { select: { userId: true } } },
    });
    if (!waiting) throw this.notWaiting();
    if (dto.approve) {
      await assertRealMoneyAllowed(this.prisma, waiting.profile.userId);
      const decidable = await this.prisma.profile.count({
        where: { id: waiting.profileId, ...decidableProfileWhere(new Date()) },
      });
      if (decidable === 0) {
        throw AppException.Conflict(
          ErrorCode.FOUNDING_CREATOR_NOT_FOUND,
          'The profile or its account is suspended or being deleted',
        );
      }
    }

    const declineReason = dto.approve ? null : (dto.reason ?? 'OTHER');
    await this.prisma.$transaction(async (tx) => {
      // An approval is written only while the Profile can still be decided
      // on: a suspension or a deletion that began meanwhile leaves it
      // waiting.
      const { count } = await tx.foundingCreatorApplication.updateMany({
        where: {
          id,
          status: FoundingCreatorStatus.PENDING,
          ...(dto.approve && { profile: decidableProfileWhere(new Date()) }),
        },
        data: {
          status: dto.approve
            ? FoundingCreatorStatus.APPROVED
            : FoundingCreatorStatus.DECLINED,
          decidedAt: new Date(),
          decidedById: adminId,
          declineReason,
          declineNote: dto.approve ? null : dto.note || null,
        },
      });
      // Decided by someone else meanwhile.
      if (count === 0) throw this.notWaiting();
      await tx.adminAuditLog.create({
        data: {
          adminId,
          action: dto.approve
            ? AdminAction.FOUNDING_CREATOR_APPROVED
            : AdminAction.FOUNDING_CREATOR_DECLINED,
          targetType: 'founding_creator_application',
          targetId: id,
          details: dto.approve ? 'Approved' : `Declined: ${declineReason}`,
        },
      });
    });
    return this.prisma.foundingCreatorApplication.findUniqueOrThrow({
      where: { id },
      select: STAFF_SELECT,
    });
  }

  private notWaiting() {
    return AppException.Conflict(
      ErrorCode.FOUNDING_CREATOR_NOT_FOUND,
      'The application is not waiting for a decision',
    );
  }
}
