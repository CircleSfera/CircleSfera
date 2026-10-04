import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminAction,
  type RiskCaseDecision,
  type RiskCaseStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfileStrikesService } from '../strikes/profile-strikes.service.js';
import { ActionLimitsService } from '../trust/action-limits.service.js';
import { RiskDetectorService } from '../trust/risk-detector.service.js';
import {
  STAFF_RESTRICTION_DAYS,
  STAFF_SUSPENSION_DAYS,
} from '../trust/trust.constants.js';
import { AdminUsersService } from './admin-users.service.js';
import { LogAdminActionUseCase } from './use-cases/content/commands/log-admin-action.use-case.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PRECISION_WINDOW_DAYS = 90;

// Staff side of the spam and bot review queue: list the cases the detector
// opened and record the decision. Every decision is audited; every action
// except a dismissal is notified to the participant, who can appeal.
@Injectable()
export class AdminRiskCasesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ActionLimitsService) private readonly limits: ActionLimitsService,
    @Inject(RiskDetectorService) private readonly detector: RiskDetectorService,
    @Inject(ProfileStrikesService)
    private readonly strikes: ProfileStrikesService,
    @Inject(AdminUsersService) private readonly adminUsers: AdminUsersService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  async list(status: RiskCaseStatus = 'OPEN', page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = { status };
    const [rows, total] = await Promise.all([
      this.prisma.riskCase.findMany({
        where,
        orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
        skip,
        take,
        include: {
          profile: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatar: true,
              userId: true,
            },
          },
          reviewedBy: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.riskCase.count({ where }),
    ]);
    return {
      data: rows,
      meta: {
        total,
        page: Math.max(page, 1),
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }

  // Share of reviewed cases that led to an action, over the last 90 days.
  // This is the detector's precision that must be measured before any
  // further automation.
  async stats() {
    const since = new Date(Date.now() - PRECISION_WINDOW_DAYS * DAY_MS);
    const [open, actioned, dismissed] = await Promise.all([
      this.prisma.riskCase.count({ where: { status: 'OPEN' } }),
      this.prisma.riskCase.count({
        where: { status: 'ACTIONED', reviewedAt: { gte: since } },
      }),
      this.prisma.riskCase.count({
        where: { status: 'DISMISSED', reviewedAt: { gte: since } },
      }),
    ]);
    const reviewed = actioned + dismissed;
    return {
      open,
      reviewedLast90Days: reviewed,
      actionedLast90Days: actioned,
      dismissedLast90Days: dismissed,
      precision:
        reviewed > 0 ? Math.round((actioned / reviewed) * 100) / 100 : null,
    };
  }

  async resolve(
    adminId: string,
    caseId: string,
    decision: RiskCaseDecision,
    note?: string,
  ) {
    const riskCase = await this.prisma.riskCase.findUnique({
      where: { id: caseId },
      include: { profile: { select: { id: true, userId: true } } },
    });
    if (!riskCase) throw new NotFoundException('Risk case not found');
    if (riskCase.status !== 'OPEN') {
      throw new ConflictException('Risk case is already resolved');
    }
    const { id: profileId, userId } = riskCase.profile;
    const now = new Date();

    let restrictedUntil: Date | null = null;
    switch (decision) {
      case 'DISMISSED':
        await this.limits.clearRestricted(profileId);
        break;
      case 'RESTRICTED':
        restrictedUntil = new Date(
          now.getTime() + STAFF_RESTRICTION_DAYS * DAY_MS,
        );
        break;
      case 'BOT_LABEL':
        await this.adminUsers.applyBotLabel(
          adminId,
          userId,
          note?.trim() ||
            'Automated or bot-like activity confirmed after a review',
        );
        await this.limits.clearRestricted(profileId);
        break;
      case 'SUSPENDED':
        await this.strikes.suspendProfile({
          adminId,
          userId,
          profileId,
          until: new Date(now.getTime() + STAFF_SUSPENSION_DAYS * DAY_MS),
        });
        await this.limits.clearRestricted(profileId);
        break;
      case 'BANNED':
        await this.strikes.banProfile({
          adminId,
          userId,
          profileId,
          reason: 'Spam or fake-account activity confirmed after a review',
        });
        await this.limits.clearRestricted(profileId);
        break;
    }

    const updated = await this.prisma.riskCase.update({
      where: { id: caseId },
      data: {
        status: decision === 'DISMISSED' ? 'DISMISSED' : 'ACTIONED',
        decision,
        reviewedById: adminId,
        reviewedAt: now,
        restrictedUntil,
      },
    });

    if (restrictedUntil) {
      await this.limits.setRestricted(profileId, restrictedUntil);
      await this.detector.notifyRestriction(profileId, caseId);
    }

    await this.logAdminAction.execute(
      adminId,
      AdminAction.RISK_CASE_RESOLVED,
      'risk_case',
      caseId,
      `Decision: ${decision}${note?.trim() ? ` (${note.trim().slice(0, 200)})` : ''}`,
    );
    return updated;
  }
}
