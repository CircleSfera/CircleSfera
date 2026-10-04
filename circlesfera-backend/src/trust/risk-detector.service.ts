import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType, type Prisma } from '@prisma/client';
import { linkedAccountsWhere } from '../common/abuse/linked-accounts.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActionLimitsService } from './action-limits.service.js';
import {
  CLOSED_CASE_RETENTION_DAYS,
  CLUSTER_LARGE,
  CLUSTER_SMALL,
  FOLLOW_RATIO_MAX,
  FOLLOW_RATIO_MIN_FOLLOWING,
  type LimitedAction,
  NEW_ACCOUNT_DAILY_WRITES,
  NEW_ACCOUNT_DAYS,
  REPORTS_DISTINCT_REPORTERS,
  RESTRICT_THRESHOLD,
  RESTRICTION_MAX_HOURS,
  REVIEW_THRESHOLD,
  RISK_POINTS,
  type RiskSignal,
  riskScore,
  VELOCITY_THRESHOLDS,
} from './trust.constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Notification.targetType for the participant notice about a protective
// restriction; the client shows a localized message.
export const RESTRICTION_NOTIFICATION_TARGET = 'profile_restriction';

export interface RiskEvaluation {
  profileId: string;
  score: number;
  signals: RiskSignal[];
}

// Scores Profiles for likely spam, bot or fake-account behaviour and opens a
// case for human review. It never sanctions: above the restriction threshold
// it only lowers the follow and message-request caps for a limited time.
// Test Accounts, banned Profiles and inactive accounts are not evaluated.
@Injectable()
export class RiskDetectorService implements OnModuleInit {
  private readonly logger = new Logger(RiskDetectorService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ActionLimitsService) private readonly limits: ActionLimitsService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.limits.onEvaluationNeeded((profileId) => {
      void this.evaluateSoon(profileId);
    });
  }

  // Evaluates in the background, at most once a minute per Profile.
  async evaluateSoon(profileId: string): Promise<void> {
    if (!(await this.limits.tryEvaluationLock(profileId))) return;
    await this.evaluateAndRecord(profileId).catch((e: unknown) =>
      this.logger.error(
        `Risk evaluation failed: ${e instanceof Error ? e.message : 'unknown'}`,
      ),
    );
  }

  // Computes the signals and the score of a Profile, or null when it is not
  // evaluated.
  async evaluate(profileId: string): Promise<RiskEvaluation | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        isAccountBanned: true,
        user: {
          select: {
            id: true,
            createdAt: true,
            isActive: true,
            isRootBanned: true,
            isTestAccount: true,
            identityVerifiedAt: true,
            signupIpHash: true,
            lastIpHash: true,
            deviceSignals: { select: { visitorHash: true } },
          },
        },
        _count: {
          select: {
            followers: { where: { status: 'ACCEPTED' } },
            following: { where: { status: 'ACCEPTED' } },
          },
        },
      },
    });
    const user = profile?.user;
    if (
      !profile ||
      !user ||
      user.isTestAccount ||
      profile.isAccountBanned ||
      !user.isActive ||
      user.isRootBanned
    ) {
      return null;
    }

    const signals: RiskSignal[] = [];
    const live = await this.limits.readSignals(profileId);

    // Velocity: the strongest of the three actions counts once.
    const velocityRatios = (
      Object.keys(VELOCITY_THRESHOLDS) as LimitedAction[]
    ).map((action) => ({
      action,
      value: live.velocity[action] ?? 0,
      over: VELOCITY_THRESHOLDS[action].over,
    }));
    const fastest = velocityRatios
      .filter((v) => v.value > v.over)
      .sort((a, b) => b.value / b.over - a.value / a.over)[0];
    if (fastest) {
      signals.push({
        key: 'velocity',
        points: RISK_POINTS.velocity,
        value: fastest.value,
      });
    }

    if (live.repeatedText > 0) {
      signals.push({
        key: 'repeatedText',
        points: RISK_POINTS.repeatedText,
        value: live.repeatedText,
      });
    }
    if (live.coordinatedText > 0) {
      signals.push({
        key: 'coordinatedText',
        points: RISK_POINTS.coordinatedText,
        value: live.coordinatedText,
      });
    }

    const ageDays = (Date.now() - user.createdAt.getTime()) / DAY_MS;
    if (
      ageDays < NEW_ACCOUNT_DAYS &&
      live.writesToday > NEW_ACCOUNT_DAILY_WRITES
    ) {
      signals.push({
        key: 'newAndHyperactive',
        points: RISK_POINTS.newAndHyperactive,
        value: live.writesToday,
      });
    }

    const where = linkedAccountsWhere(user);
    if (where) {
      const clusterSize = (await this.prisma.user.count({ where })) + 1;
      if (clusterSize >= CLUSTER_LARGE) {
        signals.push({
          key: 'clusterLarge',
          points: RISK_POINTS.clusterLarge,
          value: clusterSize,
        });
      } else if (clusterSize >= CLUSTER_SMALL) {
        signals.push({
          key: 'clusterSmall',
          points: RISK_POINTS.clusterSmall,
          value: clusterSize,
        });
      }
    }

    const following = profile._count.following;
    const followers = profile._count.followers;
    if (
      following > FOLLOW_RATIO_MIN_FOLLOWING &&
      followers < following * FOLLOW_RATIO_MAX
    ) {
      signals.push({
        key: 'followRatio',
        points: RISK_POINTS.followRatio,
        value: Math.round((followers / following) * 1000) / 1000,
      });
    }

    const reporters = await this.distinctReportersLastWeek(profileId, user.id);
    if (reporters >= REPORTS_DISTINCT_REPORTERS) {
      signals.push({
        key: 'reports',
        points: RISK_POINTS.reports,
        value: reporters,
      });
    }

    if (signals.length > 0 && user.identityVerifiedAt) {
      signals.push({
        key: 'identityVerified',
        points: RISK_POINTS.identityVerified,
        value: 1,
      });
    }

    return { profileId, score: riskScore(signals), signals };
  }

  // Evaluates a Profile and opens or updates its review case. Returns the
  // evaluation, or null when the Profile is not evaluated.
  async evaluateAndRecord(profileId: string): Promise<RiskEvaluation | null> {
    const evaluation = await this.evaluate(profileId);
    if (!evaluation || evaluation.score < REVIEW_THRESHOLD) return evaluation;

    const now = new Date();
    const restricted = await this.prisma.$transaction(async (tx) => {
      // One open case per Profile, even when two evaluations run at once.
      await tx.$queryRaw`SELECT id FROM profiles WHERE id = ${profileId} FOR UPDATE`;
      let riskCase = await tx.riskCase.findFirst({
        where: { profileId, status: 'OPEN' },
      });
      const signals = evaluation.signals as unknown as Prisma.InputJsonValue;
      if (!riskCase) {
        riskCase = await tx.riskCase.create({
          data: { profileId, score: evaluation.score, signals },
        });
      } else if (evaluation.score > riskCase.score) {
        riskCase = await tx.riskCase.update({
          where: { id: riskCase.id },
          data: { score: evaluation.score, signals },
        });
      }

      // Restrict once per case, never longer than the maximum. An appeal
      // that lifted the restriction keeps restrictedAt, so it sticks.
      if (
        evaluation.score >= RESTRICT_THRESHOLD &&
        riskCase.restrictedAt === null
      ) {
        const until = new Date(
          now.getTime() + RESTRICTION_MAX_HOURS * 60 * 60 * 1000,
        );
        await tx.riskCase.update({
          where: { id: riskCase.id },
          data: { restrictedUntil: until, restrictedAt: now },
        });
        return { caseId: riskCase.id, until };
      }
      return null;
    });

    if (restricted) {
      await this.limits.setRestricted(profileId, restricted.until);
      await this.notifyRestriction(profileId, restricted.caseId);
    }
    return evaluation;
  }

  // Lifts a protective restriction after an approved appeal. Runs inside
  // the appeal transaction; returns the Profile so its caps can be cleared
  // once the transaction commits.
  async liftRestrictionForAppeal(
    tx: Prisma.TransactionClient,
    caseId: string,
  ): Promise<string | null> {
    const riskCase = await tx.riskCase.findUnique({
      where: { id: caseId },
      select: { profileId: true },
    });
    if (!riskCase) return null;
    await tx.riskCase.update({
      where: { id: caseId },
      data: { restrictedUntil: null },
    });
    return riskCase.profileId;
  }

  async notifyRestriction(profileId: string, caseId: string): Promise<void> {
    await this.notificationsService
      .create({
        recipientId: profileId,
        type: NotificationType.MODERATION,
        content:
          'We have temporarily limited how many accounts this profile can follow and message while we review unusual activity. You can appeal this decision.',
        targetType: RESTRICTION_NOTIFICATION_TARGET,
        targetId: caseId,
      })
      .catch((e: unknown) => this.logger.error(e));
  }

  // Nightly: re-evaluates the Profiles that wrote something recently, for
  // the signals that do not come from a single action (shared IPs or
  // devices, follow ratio, reports), and deletes closed cases past their
  // retention.
  @Cron('30 3 * * *')
  async nightly(): Promise<void> {
    const profileIds = await this.limits.recentlyActiveProfiles();
    let opened = 0;
    for (const profileId of profileIds) {
      try {
        const result = await this.evaluateAndRecord(profileId);
        if (result && result.score >= REVIEW_THRESHOLD) opened++;
      } catch (e) {
        this.logger.error(
          `Nightly risk evaluation failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    }
    const purged = await this.purgeClosedCases();
    this.logger.log(
      `Nightly risk run: ${profileIds.length} evaluated, ${opened} at or above the review threshold, ${purged} closed cases purged`,
    );
  }

  async purgeClosedCases(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - CLOSED_CASE_RETENTION_DAYS * DAY_MS,
    );
    const { count } = await this.prisma.riskCase.deleteMany({
      where: { status: { not: 'OPEN' }, updatedAt: { lt: cutoff } },
    });
    return count;
  }

  // Distinct reporters in the last 7 days about the Profile itself or its
  // posts, comments and messages.
  private async distinctReportersLastWeek(
    profileId: string,
    userId: string,
  ): Promise<number> {
    const since = new Date(Date.now() - 7 * DAY_MS);
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT r."reporterId") AS n
      FROM reports r
      WHERE r."createdAt" >= ${since}
        AND r."reporterId" <> ${profileId}
        AND (
          (r."targetType"::text = 'USER' AND r."targetId" = ${userId})
          OR (r."targetType"::text = 'POST' AND r."targetId" IN (SELECT id FROM posts WHERE "profileId" = ${profileId}))
          OR (r."targetType"::text = 'COMMENT' AND r."targetId" IN (SELECT id FROM comments WHERE "profileId" = ${profileId}))
          OR (r."targetType"::text = 'MESSAGE' AND r."targetId" IN (SELECT id FROM messages WHERE "senderId" = ${profileId}))
        )
    `;
    return Number(rows[0]?.n ?? 0);
  }
}
