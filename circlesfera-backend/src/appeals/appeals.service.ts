import type { ModerationReportFiledEvent } from '@circlesfera/shared';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationType, type Prisma } from '@prisma/client';
import { resolveAdminNotificationSenderId } from '../admin/utils/resolve-admin-notification-sender.js';
import { resolvedAtOnStatusChange } from '../admin/utils/resolved-at.util.js';
import { withPrimaryProfile } from '../common/utils/user-profile-shape.util.js';
import { EmailService } from '../email/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfileStrikesService } from '../strikes/profile-strikes.service.js';
import { ActionLimitsService } from '../trust/action-limits.service.js';
import { RiskDetectorService } from '../trust/risk-detector.service.js';
import { CreateAppealDto } from './dto/create-appeal.dto.js';
import { UpdateAppealDto } from './dto/update-appeal.dto.js';

@Injectable()
export class AppealsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
    @Inject(EmailService) private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(ProfileStrikesService)
    private readonly strikesService: ProfileStrikesService,
    @Inject(RiskDetectorService)
    private readonly riskDetector: RiskDetectorService,
    @Inject(ActionLimitsService)
    private readonly actionLimits: ActionLimitsService,
  ) {}

  // The appealed item must belong to the appellant: approving an appeal
  // restores it, so an appeal about someone else's post, strike or Profile
  // is refused. Returns the target id to store.
  private async resolveOwnedTarget(
    userId: string,
    dto: CreateAppealDto,
    onlyProfileId?: string,
  ): Promise<string | undefined> {
    const targetId = dto.targetId?.trim() || undefined;
    switch (dto.targetType) {
      case 'POST_REMOVAL': {
        if (!targetId) throw new BadRequestException('targetId is required');
        const post = await this.prisma.post.findFirst({
          where: { id: targetId, profile: { userId } },
          select: { id: true },
        });
        if (!post) throw new NotFoundException('Post not found');
        return targetId;
      }
      case 'STRIKE': {
        if (!targetId) throw new BadRequestException('targetId is required');
        const strike = await this.prisma.profileStrike.findFirst({
          where: {
            id: targetId,
            profile: { userId },
            ...(onlyProfileId ? { profileId: onlyProfileId } : {}),
          },
          select: { id: true },
        });
        if (!strike) throw new NotFoundException('Strike not found');
        return targetId;
      }
      case 'RESTRICTION': {
        if (!targetId) throw new BadRequestException('targetId is required');
        const riskCase = await this.prisma.riskCase.findFirst({
          where: { id: targetId, profile: { userId } },
          select: { id: true },
        });
        if (!riskCase) throw new NotFoundException('Restriction not found');
        return targetId;
      }
      case 'ACCOUNT_BAN': {
        if (!targetId) return undefined;
        const profile = await this.prisma.profile.findFirst({
          where: { id: targetId, userId },
          select: { id: true },
        });
        if (!profile) throw new NotFoundException('Profile not found');
        return targetId;
      }
      default:
        return undefined;
    }
  }

  // onlyProfileId: set for appeals filed with a login-screen appeal token,
  // which may only concern the Profile that could not sign in.
  async create(userId: string, dto: CreateAppealDto, onlyProfileId?: string) {
    const targetId = await this.resolveOwnedTarget(userId, dto, onlyProfileId);

    const appeal = await this.prisma.$transaction(async (tx) => {
      // Serialize appeals of one account so two concurrent requests cannot
      // both pass the pending check.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const pending = await tx.appeal.findFirst({
        where: {
          userId,
          targetType: dto.targetType,
          targetId: targetId ?? null,
          status: 'PENDING',
        },
        select: { id: true },
      });
      if (pending) {
        throw new ConflictException(
          'An appeal for this decision is already pending',
        );
      }
      return tx.appeal.create({
        data: {
          userId,
          targetType: dto.targetType,
          targetId,
          reason: dto.reason,
        },
      });
    });

    const reportFiledEvent: ModerationReportFiledEvent['payload'] = {
      reportId: appeal.id,
      reporterId: userId,
      targetType: dto.targetType,
      targetId: targetId || 'N/A',
      reason: `New Appeal Created: ${dto.reason}`,
    };
    this.eventEmitter.emit('moderation.report_filed', reportFiledEvent);

    return appeal;
  }

  async findMyUserAppeals(userId: string) {
    return this.prisma.appeal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Admin Methods
  async findAll(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;
    const where: { status?: 'PENDING' | 'APPROVED' | 'REJECTED' } = {};
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      where.status = status as 'PENDING' | 'APPROVED' | 'REJECTED';
    }

    const [rows, total] = await Promise.all([
      this.prisma.appeal.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              isActive: true,
              profiles: {
                select: {
                  username: true,
                  fullName: true,
                  avatar: true,
                  suspendedUntil: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.appeal.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (appeal) => {
        let targetPreview: {
          text?: string | null;
          moderationStatus?: string | null;
          type?: string;
        } | null = null;

        const primaryProfile = appeal.user?.profiles?.[0];

        if (appeal.targetType === 'POST_REMOVAL' && appeal.targetId) {
          const post = await this.prisma.post.findUnique({
            where: { id: appeal.targetId },
            select: {
              caption: true,
              moderationStatus: true,
              type: true,
            },
          });
          if (post) {
            targetPreview = {
              text: post.caption?.slice(0, 160) ?? null,
              moderationStatus: post.moderationStatus,
              type: post.type,
            };
          }
        } else if (appeal.targetType === 'ACCOUNT_BAN') {
          targetPreview = {
            text:
              appeal.user?.isActive === false ? 'Account inactive' : 'Account',
            moderationStatus: primaryProfile?.suspendedUntil
              ? 'SUSPENDED'
              : appeal.user?.isActive === false
                ? 'BANNED'
                : 'ACTIVE',
            type: 'ACCOUNT',
          };
        } else if (appeal.targetType === 'STRIKE' && appeal.targetId) {
          const strike = await this.prisma.profileStrike.findUnique({
            where: { id: appeal.targetId },
            select: {
              kind: true,
              reason: true,
              consequence: true,
              revokedAt: true,
              expiresAt: true,
            },
          });
          if (strike) {
            targetPreview = {
              text: `${strike.kind} for ${strike.reason}${strike.consequence === 'NONE' ? '' : ` (${strike.consequence})`}`,
              moderationStatus: strike.revokedAt
                ? 'REVOKED'
                : strike.expiresAt > new Date()
                  ? 'ACTIVE'
                  : 'EXPIRED',
              type: 'STRIKE',
            };
          }
        } else if (appeal.targetType === 'RESTRICTION' && appeal.targetId) {
          const riskCase = await this.prisma.riskCase.findUnique({
            where: { id: appeal.targetId },
            select: { score: true, restrictedUntil: true, status: true },
          });
          if (riskCase) {
            targetPreview = {
              text: `Spam review case, score ${riskCase.score}`,
              moderationStatus:
                riskCase.restrictedUntil &&
                riskCase.restrictedUntil > new Date()
                  ? 'RESTRICTED'
                  : riskCase.status,
              type: 'RESTRICTION',
            };
          }
        } else if (appeal.targetType === 'BOT_LABEL') {
          targetPreview = {
            text: 'Possible bot label',
            moderationStatus: 'LABELED',
            type: 'ACCOUNT',
          };
        }

        return {
          ...appeal,
          user: appeal.user ? withPrimaryProfile(appeal.user) : null,
          targetPreview,
        };
      }),
    );

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string) {
    const appeal = await this.prisma.appeal.findUnique({
      where: { id },
      include: {
        user: {
          include: { profiles: true },
        },
      },
    });
    if (!appeal) throw new NotFoundException('Appeal not found');
    return appeal;
  }

  async update(id: string, dto: UpdateAppealDto, adminId: string) {
    const appeal = await this.findOne(id);

    // Profiles whose public view changes, to drop their cache afterwards.
    const affectedProfileIds: string[] = [];
    // Profiles whose protective restriction is lifted, to clear their caps.
    const liftedRestrictionIds: string[] = [];
    const updatedAppeal = await this.prisma.$transaction(async (tx) => {
      const resolvedAt = resolvedAtOnStatusChange(
        dto.status,
        appeal.resolvedAt,
        ['APPROVED', 'REJECTED'],
        'PENDING',
      );
      const res = await tx.appeal.update({
        where: { id },
        data: {
          status: dto.status,
          adminNotes: dto.adminNotes,
          ...(resolvedAt !== undefined ? { resolvedAt } : {}),
        },
      });

      // Approving twice must not repeat the side effects.
      if (dto.status === 'APPROVED' && appeal.status !== 'APPROVED') {
        if (appeal.targetType === 'RESTRICTION' && appeal.targetId) {
          const profileId = await this.riskDetector.liftRestrictionForAppeal(
            tx,
            appeal.targetId,
          );
          if (profileId) liftedRestrictionIds.push(profileId);
        }
        if (appeal.targetType === 'STRIKE' && appeal.targetId) {
          const profileId = await this.strikesService.revokeForAppeal(
            tx,
            appeal.targetId,
          );
          if (profileId) affectedProfileIds.push(profileId);
        }
        if (appeal.targetType === 'ACCOUNT_BAN') {
          // A Profile ban or suspension is lifted on that Profile only.
          // Older appeals carry no Profile, so every restricted Profile of
          // the account is lifted.
          const restricted = appeal.targetId
            ? [{ id: appeal.targetId }]
            : await tx.profile.findMany({
                where: {
                  userId: appeal.userId,
                  OR: [
                    { isAccountBanned: true },
                    { suspendedUntil: { not: null } },
                  ],
                },
                select: { id: true },
              });
          for (const profile of restricted) {
            await this.strikesService.liftRestrictionForAppeal(tx, profile.id);
            affectedProfileIds.push(profile.id);
          }
          await tx.user.update({
            where: { id: appeal.userId },
            data: {
              isActive: true,
            },
          });
        }
        if (appeal.targetType === 'BOT_LABEL') {
          await tx.user.update({
            where: { id: appeal.userId },
            data: {
              botLabeledAt: null,
              botLabelReason: null,
            } satisfies Prisma.UserUpdateInput,
          });
        }
        if (appeal.targetType === 'POST_REMOVAL' && appeal.targetId) {
          await tx.post.update({
            where: { id: appeal.targetId },
            data: { moderationStatus: 'VISIBLE' },
          });
        }
      }

      return res;
    });
    await this.strikesService.invalidateProfileCache(affectedProfileIds);
    await Promise.all(
      liftedRestrictionIds.map((id) => this.actionLimits.clearRestricted(id)),
    );

    await this.prisma.adminAuditLog
      .create({
        data: {
          adminId,
          action:
            dto.status === 'APPROVED' ? 'ACCOUNT_RESTORED' : 'REPORT_REVIEWED',
          targetType: 'appeal',
          targetId: appeal.id,
          details: `Appeal ${dto.status}: ${dto.adminNotes || ''}`.trim(),
        },
      })
      .catch((e) => console.error(e));

    const statusEvent: ModerationReportFiledEvent['payload'] = {
      reportId: appeal.id,
      reporterId: appeal.userId,
      targetType: appeal.targetType,
      targetId: appeal.targetId || 'N/A',
      reason: `Appeal Status Updated: ${dto.status}. Notes: ${dto.adminNotes || 'None'}`,
    };
    this.eventEmitter.emit('moderation.report_filed', statusEvent);

    const senderId = await resolveAdminNotificationSenderId(
      this.prisma,
      adminId,
    );
    const appealProfile = await this.appealedProfile(appeal);
    if (appealProfile) {
      await this.notificationsService
        .create({
          recipientId: appealProfile.id,
          senderId,
          type: NotificationType.MODERATION,
          notice: {
            key: 'appeal_decided',
            outcome: dto.status,
            notes: dto.adminNotes,
          },
          postId:
            appeal.targetType === 'POST_REMOVAL'
              ? (appeal.targetId ?? undefined)
              : undefined,
        })
        .catch((e) => console.error(e));
    }

    const appealUser = await this.prisma.user.findUnique({
      where: { id: appeal.userId },
      select: {
        email: true,
        profiles: { select: { username: true, fullName: true }, take: 1 },
      },
    });
    // Only a decision is emailed; moving an appeal back to pending is not.
    if (
      appealUser?.email &&
      (dto.status === 'APPROVED' || dto.status === 'REJECTED')
    ) {
      const profile = appealUser.profiles[0];
      await this.emailService
        .sendAppealDecisionEmail(
          appealUser.email,
          profile?.fullName || profile?.username,
          dto.status === 'APPROVED',
          dto.adminNotes,
        )
        .catch((e) => console.error(e));
    }

    return updatedAppeal;
  }

  // The Profile the appealed decision was about, to send the outcome there;
  // falls back to the account's first Profile.
  private async appealedProfile(appeal: {
    userId: string;
    targetType: string;
    targetId: string | null;
  }): Promise<{ id: string } | null> {
    if (appeal.targetType === 'STRIKE' && appeal.targetId) {
      const strike = await this.prisma.profileStrike.findUnique({
        where: { id: appeal.targetId },
        select: { profileId: true },
      });
      if (strike) return { id: strike.profileId };
    }
    if (appeal.targetType === 'ACCOUNT_BAN' && appeal.targetId) {
      return { id: appeal.targetId };
    }
    if (appeal.targetType === 'RESTRICTION' && appeal.targetId) {
      const riskCase = await this.prisma.riskCase.findUnique({
        where: { id: appeal.targetId },
        select: { profileId: true },
      });
      if (riskCase) return { id: riskCase.profileId };
    }
    return this.prisma.profile.findFirst({
      where: { userId: appeal.userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
  }
}
