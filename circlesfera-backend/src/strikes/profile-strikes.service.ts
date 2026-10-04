import type { UserSessionTerminateEvent } from '@circlesfera/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotificationType,
  type Prisma,
  type ProfileStrike,
  type ProfileStrikeConsequence,
  type ProfileStrikeKind,
  type ReportReason,
} from '@prisma/client';
import { resolveAdminNotificationSenderId } from '../admin/utils/resolve-admin-notification-sender.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  activeStrikeRecordWhere,
  STRIKES_TO_BAN,
  STRIKES_TO_SUSPEND,
  strikeExpiresAt,
  suspensionEndsAt,
} from './profile-strikes.constants.js';

// Notification.targetType values for moderation notices about a Profile. The
// client uses them to show a localized message and a link to the details.
export const STRIKE_NOTIFICATION_TARGET = {
  WARNING: 'profile_warning',
  STRIKE: 'profile_strike',
  SUSPENDED: 'profile_suspension',
  BANNED: 'profile_ban',
} as const;

const REASON_LABEL: Record<ReportReason, string> = {
  SPAM: 'spam',
  HARASSMENT: 'harassment',
  ILLEGAL_CONTENT: 'illegal content',
  VIOLENCE: 'violence',
  HATE_SPEECH: 'hate speech',
  IMPERSONATION: 'impersonation',
  CSAM: 'child sexual abuse material',
  SCAM: 'scam',
  OTHER: 'a community guidelines violation',
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface ProfileViolation {
  adminId: string;
  profileId: string;
  // Owner of the Profile, used to end the Profile's sessions.
  userId: string | null;
  reportId: string | null;
  reason: ReportReason;
}

export interface AppliedViolation {
  strike: ProfileStrike;
  // Active strikes after this one (warnings are not counted).
  activeStrikes: number;
  suspendedUntil: Date | null;
}

export type ProfileStrikeStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface ProfileStrikeView {
  id: string;
  kind: ProfileStrikeKind;
  reason: ReportReason;
  consequence: ProfileStrikeConsequence;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  status: ProfileStrikeStatus;
}

@Injectable()
export class ProfileStrikesService {
  private readonly logger = new Logger(ProfileStrikesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
  ) {}

  // Records an upheld violation and applies its consequence. The first
  // violation while nothing is active is a warning; later ones are strikes,
  // and the active strike count decides the consequence.
  async applyViolation(
    violation: ProfileViolation,
  ): Promise<AppliedViolation | null> {
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize violations for the same Profile so two reviews resolved at
      // the same time cannot both read the same count.
      await tx.$queryRaw`
        SELECT id FROM profiles WHERE id = ${violation.profileId} FOR UPDATE
      `;

      // Resolving the same report again must not add a second record.
      if (violation.reportId) {
        const existing = await tx.profileStrike.findFirst({
          where: {
            reportId: violation.reportId,
            profileId: violation.profileId,
          },
          select: { id: true },
        });
        if (existing) return null;
      }

      const active = await tx.profileStrike.findMany({
        where: {
          profileId: violation.profileId,
          ...activeStrikeRecordWhere(now),
        },
        select: { kind: true },
      });
      const activeStrikesBefore = active.filter(
        (s) => s.kind === 'STRIKE',
      ).length;

      const kind: ProfileStrikeKind =
        active.length === 0 ? 'WARNING' : 'STRIKE';
      const activeStrikes =
        kind === 'STRIKE' ? activeStrikesBefore + 1 : activeStrikesBefore;

      let consequence: ProfileStrikeConsequence = 'NONE';
      if (kind === 'STRIKE' && activeStrikes >= STRIKES_TO_BAN) {
        consequence = 'BANNED';
      } else if (kind === 'STRIKE' && activeStrikes >= STRIKES_TO_SUSPEND) {
        consequence = 'SUSPENDED';
      }

      const strike = await tx.profileStrike.create({
        data: {
          profileId: violation.profileId,
          kind,
          reason: violation.reason,
          consequence,
          reportId: violation.reportId,
          adminId: violation.adminId,
          createdAt: now,
          expiresAt: strikeExpiresAt(now),
        },
      });

      let suspendedUntil: Date | null = null;
      if (consequence === 'BANNED') {
        await tx.profile.update({
          where: { id: violation.profileId },
          data: {
            isAccountBanned: true,
            accountBanReason: `Repeated violations of the community guidelines (${activeStrikes} active strikes)`,
          },
        });
      } else if (consequence === 'SUSPENDED') {
        const profile = await tx.profile.findUnique({
          where: { id: violation.profileId },
          select: { suspendedUntil: true },
        });
        const proposed = suspensionEndsAt(now);
        // Never shorten a longer suspension that is already running.
        suspendedUntil =
          profile?.suspendedUntil && profile.suspendedUntil > proposed
            ? profile.suspendedUntil
            : proposed;
        await tx.profile.update({
          where: { id: violation.profileId },
          data: { suspendedUntil },
        });
      }

      return { strike, activeStrikes, suspendedUntil };
    });
    if (!result) return null;

    if (result.strike.consequence !== 'NONE') {
      this.endProfileSessions(
        violation.userId,
        violation.profileId,
        result.strike.consequence === 'BANNED'
          ? 'Profile banned after repeated strikes'
          : 'Profile suspended after a strike',
      );
    }
    await this.notify(
      violation.adminId,
      violation.profileId,
      this.describe(result),
      this.notificationTarget(result.strike),
      result.strike.id,
    );

    return result;
  }

  // Severe violation: bans the Profile at once, without the strike ladder.
  // The account and its other Profiles are not affected; an account-wide ban
  // is a separate staff action.
  async banProfile(params: {
    adminId: string;
    userId: string | null;
    profileId: string;
    reason: string;
  }): Promise<void> {
    await this.prisma.profile.update({
      where: { id: params.profileId },
      data: { isAccountBanned: true, accountBanReason: params.reason },
    });
    this.endProfileSessions(
      params.userId,
      params.profileId,
      'Profile banned after a report review',
    );
    await this.notify(
      params.adminId,
      params.profileId,
      'This profile was banned after a report review. Your other profiles are not affected. You can appeal this decision.',
      STRIKE_NOTIFICATION_TARGET.BANNED,
      params.profileId,
    );
  }

  // Every warning and strike of a Profile, newest first, with its state.
  async listForProfile(profileId: string): Promise<ProfileStrikeView[]> {
    const now = new Date();
    const rows = await this.prisma.profileStrike.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        kind: true,
        reason: true,
        consequence: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      status: row.revokedAt
        ? 'REVOKED'
        : row.expiresAt > now
          ? 'ACTIVE'
          : 'EXPIRED',
    }));
  }

  // Withdraws a strike after an approved appeal. A suspension or ban that
  // this strike caused is lifted if it is still in force.
  async revokeForAppeal(
    tx: Prisma.TransactionClient,
    strikeId: string,
  ): Promise<void> {
    const now = new Date();
    const strike = await tx.profileStrike.findUnique({
      where: { id: strikeId },
      select: { id: true, profileId: true, consequence: true, revokedAt: true },
    });
    if (!strike || strike.revokedAt) return;

    await tx.profileStrike.update({
      where: { id: strike.id },
      data: { revokedAt: now },
    });
    await this.liftConsequence(tx, strike.profileId, strike.consequence, now);
  }

  // Lifts a Profile ban or suspension after an approved appeal, and
  // withdraws the strike that caused it, if any.
  async liftRestrictionForAppeal(
    tx: Prisma.TransactionClient,
    profileId: string,
  ): Promise<void> {
    const now = new Date();
    const cause = await tx.profileStrike.findFirst({
      where: {
        profileId,
        revokedAt: null,
        consequence: { in: ['BANNED', 'SUSPENDED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (cause) {
      await tx.profileStrike.update({
        where: { id: cause.id },
        data: { revokedAt: now },
      });
    }
    await tx.profile.update({
      where: { id: profileId },
      data: {
        isAccountBanned: false,
        accountBanReason: null,
        suspendedUntil: null,
      },
    });
  }

  private async liftConsequence(
    tx: Prisma.TransactionClient,
    profileId: string,
    consequence: ProfileStrikeConsequence,
    now: Date,
  ): Promise<void> {
    if (consequence === 'BANNED') {
      await tx.profile.updateMany({
        where: { id: profileId, isAccountBanned: true },
        data: { isAccountBanned: false, accountBanReason: null },
      });
    } else if (consequence === 'SUSPENDED') {
      await tx.profile.updateMany({
        where: { id: profileId, suspendedUntil: { gt: now } },
        data: { suspendedUntil: null },
      });
    }
  }

  private notificationTarget(strike: ProfileStrike): string {
    if (strike.kind === 'WARNING') return STRIKE_NOTIFICATION_TARGET.WARNING;
    if (strike.consequence === 'BANNED') {
      return STRIKE_NOTIFICATION_TARGET.BANNED;
    }
    if (strike.consequence === 'SUSPENDED') {
      return STRIKE_NOTIFICATION_TARGET.SUSPENDED;
    }
    return STRIKE_NOTIFICATION_TARGET.STRIKE;
  }

  // English text stored on the notification; the client shows a localized
  // message from the notification's target type.
  private describe(result: AppliedViolation): string {
    const { strike, activeStrikes, suspendedUntil } = result;
    const rule = REASON_LABEL[strike.reason];
    const expires = isoDay(strike.expiresAt);
    if (strike.kind === 'WARNING') {
      return `Warning: this profile broke the community guidelines (${rule}). There is no penalty this time. The warning expires on ${expires}. You can appeal it.`;
    }
    const prefix = `Strike ${activeStrikes} of ${STRIKES_TO_BAN} on this profile for breaking the community guidelines (${rule}). It expires on ${expires}.`;
    if (strike.consequence === 'BANNED') {
      return `${prefix} This profile is banned. Your other profiles are not affected. You can appeal this decision.`;
    }
    if (strike.consequence === 'SUSPENDED' && suspendedUntil) {
      return `${prefix} This profile is suspended until ${isoDay(suspendedUntil)}. You can appeal this decision.`;
    }
    return `${prefix} You can appeal it.`;
  }

  private endProfileSessions(
    userId: string | null,
    profileId: string,
    reason: string,
  ): void {
    if (!userId) return;
    const event: UserSessionTerminateEvent['payload'] = {
      userId,
      profileId,
      reason,
      scope: 'profile',
    };
    this.eventEmitter.emit('user.session.terminate', event);
  }

  private async notify(
    adminId: string,
    recipientId: string,
    content: string,
    targetType: string,
    targetId: string,
  ): Promise<void> {
    const senderId = await resolveAdminNotificationSenderId(
      this.prisma,
      adminId,
    );
    await this.notificationsService
      .create({
        recipientId,
        senderId,
        type: NotificationType.MODERATION,
        content,
        targetType,
        targetId,
      })
      .catch((e: unknown) => this.logger.error(e));
  }
}
