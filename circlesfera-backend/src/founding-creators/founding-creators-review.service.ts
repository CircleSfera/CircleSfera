import { ErrorCode } from '@circlesfera/shared';
import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  AdminAction,
  FoundingCreatorStatus,
  type Prisma,
} from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import { assertRealMoneyAllowed } from '../common/policies/test-account.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DecideFoundingCreatorDto } from './dto/decide-founding-creator.dto.js';
import { FoundingCreatorsService } from './founding-creators.service.js';

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

// Why an approved application's free year did not start: the error code
// the person would be shown (identity not verified, a plan already held, a
// Test Account, not an adult payer), or FAILED for anything else.
function notStartedBecause(err: unknown): string {
  if (err instanceof AppException) return err.errorCode;
  if (err instanceof HttpException && typeof err.message === 'string') {
    return err.message;
  }
  return 'FAILED';
}

// Staff with the founding-creators permission decide on applications in the
// Backoffice. Every decision is recorded in the staff audit log, with the
// application; who decided is never shown to the person.
@Injectable()
export class FoundingCreatorsReviewService {
  private readonly logger = new Logger(FoundingCreatorsReviewService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FoundingCreatorsService)
    private readonly founders: FoundingCreatorsService,
  ) {}

  // The applications waiting, oldest first.
  async queue() {
    const where = { status: FoundingCreatorStatus.PENDING };
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

  // Approves or declines a waiting application. An approval starts the free
  // year at once when it can; when it cannot yet (the identity not
  // verified, a plan already held), the approval stands and the answer says
  // why, and the person starts the year from the app later. A Test Account
  // is never approved where money is real: nothing is recorded.
  async decide(adminId: string, id: string, dto: DecideFoundingCreatorDto) {
    const waiting = await this.prisma.foundingCreatorApplication.findFirst({
      where: { id, status: FoundingCreatorStatus.PENDING },
      select: { profile: { select: { userId: true } } },
    });
    if (!waiting) throw this.notWaiting();
    if (dto.approve) {
      await assertRealMoneyAllowed(this.prisma, waiting.profile.userId);
    }

    const declineReason = dto.approve ? null : (dto.reason ?? 'OTHER');
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.foundingCreatorApplication.updateMany({
        where: { id, status: FoundingCreatorStatus.PENDING },
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

    // The decision stands once committed: a free year that cannot start
    // now never reports the approval as failed.
    let freeYearNotStarted: string | null = null;
    if (dto.approve) {
      try {
        await this.founders.startYearOf(id);
      } catch (err) {
        freeYearNotStarted = notStartedBecause(err);
        if (freeYearNotStarted === 'FAILED') {
          this.logger.error(
            `The free year of founding creator application ${id} could not start`,
            err,
          );
        }
      }
    }
    return { ...(await this.detail(id)), freeYearNotStarted };
  }

  private async detail(id: string) {
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
