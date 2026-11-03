import {
  DEFAULT_LIVE_AUDIENCE,
  ErrorCode,
  LIVE_REMINDER_LEAD_MINUTES,
  LIVE_SCHEDULE_AUDIENCES,
  LIVE_SCHEDULE_GRACE_MINUTES,
  LIVE_SCHEDULE_MAX_DAYS,
  LIVE_SCHEDULE_MIN_MINUTES,
  LIVE_SCHEDULED_MAX,
  type LiveAudience,
  type LiveScheduleAudience,
} from '@circlesfera/shared';
import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, type ScheduledLiveStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';
import type { Notice } from '../notifications/notice-copy.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SYSTEM_SETTING_KEYS } from '../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { HOST_SHOWN_SELECT, hostShown } from './live-audience.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// Reminders are read and told a page at a time.
const PAGE = 500;

const SCHEDULED_SELECT = {
  id: true,
  hostId: true,
  title: true,
  audience: true,
  startsAt: true,
  status: true,
  createdAt: true,
} as const;

/** A scheduled live, as the app is answered it. */
export interface ScheduledLiveView {
  id: string;
  hostId: string;
  title: string;
  audience: LiveAudience;
  startsAt: Date;
  status: ScheduledLiveStatus;
  createdAt: Date;
  /** Whether the viewer asked to be reminded of it. */
  reminded: boolean;
  /** How many asked to be reminded of it: told to its host only. */
  reminderCount?: number;
}

interface ScheduledRow {
  id: string;
  hostId: string;
  title: string;
  audience: LiveAudience;
  startsAt: Date;
  status: ScheduledLiveStatus;
  createdAt: Date;
}

/** The live a notice is about: who hosts it, its title and who it is for. */
interface NoticeLive {
  id: string;
  hostId: string;
  title: string;
  audience: LiveAudience;
}

const isScheduleAudience = (
  audience: LiveAudience,
): audience is LiveScheduleAudience =>
  (LIVE_SCHEDULE_AUDIENCES as readonly LiveAudience[]).includes(audience);

const scheduledNotFound = () =>
  AppException.NotFound(
    ErrorCode.SCHEDULED_LIVE_NOT_FOUND,
    'Scheduled live not found',
  );

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Lives a host means to start later, and the reminders of those who want to
 * be told. A scheduled live is seen by exactly whoever could watch the live:
 * its host, and for anyone else, a host that may be seen, no block either
 * way, and an audience that is for them. Anyone else is answered as if it
 * did not exist.
 */
@Injectable()
export class LiveScheduleService {
  private readonly logger = new Logger(LiveScheduleService.name);
  private remindingSoon = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    @Inject(SystemSettingsService)
    private readonly systemSettings: SystemSettingsService,
  ) {}

  private view(
    row: ScheduledRow,
    reminded: boolean,
    reminderCount?: number,
  ): ScheduledLiveView {
    return {
      id: row.id,
      hostId: row.hostId,
      title: row.title,
      audience: row.audience,
      startsAt: row.startsAt,
      status: row.status,
      createdAt: row.createdAt,
      reminded,
      ...(reminderCount === undefined ? {} : { reminderCount }),
    };
  }

  private async isCloseFriendOf(hostId: string, viewerProfileId: string) {
    const friend = await this.prisma.closeFriend.findUnique({
      where: {
        profileId_friendId: { profileId: hostId, friendId: viewerProfileId },
      },
      select: { id: true },
    });
    return friend !== null;
  }

  /** Schedules a live of the host's: between the earliest and furthest time, within the limit. */
  async schedule(
    hostProfileId: string,
    input: { title: string; audience?: LiveAudience; startsAt: string },
    now: Date = new Date(),
  ): Promise<ScheduledLiveView> {
    // While staff have live streams switched off, nobody schedules one, as
    // nobody starts one.
    const liveEnabled = await this.systemSettings.isEnabled(
      SYSTEM_SETTING_KEYS.LIVE_STREAMS_ENABLED,
    );
    if (!liveEnabled) throw new ForbiddenException('LIVE_STREAMS_DISABLED');
    const audience = input.audience ?? DEFAULT_LIVE_AUDIENCE;
    if (!isScheduleAudience(audience)) {
      throw AppException.BadRequest(
        ErrorCode.LIVE_SCHEDULE_AUDIENCE_INVALID,
        'A practice cannot be scheduled',
      );
    }
    const startsAt = new Date(input.startsAt);
    const earliest = now.getTime() + LIVE_SCHEDULE_MIN_MINUTES * MINUTE_MS;
    const furthest = now.getTime() + LIVE_SCHEDULE_MAX_DAYS * DAY_MS;
    const at = startsAt.getTime();
    if (Number.isNaN(at) || at < earliest || at > furthest) {
      throw AppException.BadRequest(
        ErrorCode.LIVE_SCHEDULE_TIME_INVALID,
        'A live starts too soon or too far ahead',
        {
          minMinutes: LIVE_SCHEDULE_MIN_MINUTES,
          maxDays: LIVE_SCHEDULE_MAX_DAYS,
        },
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // Two schedules of one host at once are counted one after the other.
      await tx.$queryRaw`SELECT id FROM profiles WHERE id = ${hostProfileId} FOR UPDATE`;
      const upcoming = await tx.scheduledLive.count({
        where: { hostId: hostProfileId, status: 'SCHEDULED' },
      });
      if (upcoming >= LIVE_SCHEDULED_MAX) {
        throw AppException.Conflict(
          ErrorCode.LIVE_SCHEDULED_LIMIT,
          'Too many upcoming lives',
          { max: LIVE_SCHEDULED_MAX },
        );
      }
      return tx.scheduledLive.create({
        data: { hostId: hostProfileId, title: input.title, audience, startsAt },
        select: SCHEDULED_SELECT,
      });
    });
    return this.view(created, false, 0);
  }

  /** The host cancels an upcoming live of theirs. Nobody is told. */
  async cancel(hostProfileId: string, scheduledLiveId: string) {
    const cancelled = await this.prisma.scheduledLive.updateMany({
      where: {
        id: scheduledLiveId,
        hostId: hostProfileId,
        status: 'SCHEDULED',
      },
      data: { status: 'CANCELLED' },
    });
    if (cancelled.count === 0) throw scheduledNotFound();
    return { success: true };
  }

  /**
   * A Profile's upcoming lives that the viewer may see, soonest first, with
   * whether the viewer asked to be reminded; to the host, with how many did
   * among those who may still see it: not in a block with the host either
   * way and, for a live for close friends, still on the host's list.
   */
  async listUpcoming(
    profileId: string,
    viewerProfileId: string,
  ): Promise<ScheduledLiveView[]> {
    const own = profileId === viewerProfileId;
    let audiences: LiveScheduleAudience[] = [...LIVE_SCHEDULE_AUDIENCES];
    if (!own) {
      const host = await this.prisma.profile.findUnique({
        where: { id: profileId },
        select: HOST_SHOWN_SELECT,
      });
      if (
        !host ||
        !hostShown(host) ||
        (await isBlockedEitherWay(this.prisma, viewerProfileId, profileId))
      ) {
        return [];
      }
      if (!(await this.isCloseFriendOf(profileId, viewerProfileId))) {
        audiences = ['EVERYONE'];
      }
    }
    const rows = await this.prisma.scheduledLive.findMany({
      where: {
        hostId: profileId,
        status: 'SCHEDULED',
        audience: { in: audiences },
      },
      select: {
        ...SCHEDULED_SELECT,
        reminders: {
          where: { profileId: viewerProfileId },
          select: { id: true },
        },
        _count: {
          select: {
            reminders: {
              where: {
                profile: {
                  blocking: { none: { blockedId: profileId } },
                  blockedBy: { none: { blockerId: profileId } },
                },
                OR: [
                  { scheduledLive: { audience: 'EVERYONE' } },
                  {
                    profile: {
                      closeFriendOf: { some: { profileId: profileId } },
                    },
                  },
                ],
              },
            },
          },
        },
      },
      orderBy: { startsAt: 'asc' },
      take: LIVE_SCHEDULED_MAX,
    });
    return rows.map((row) =>
      this.view(
        row,
        row.reminders.length > 0,
        own ? row._count.reminders : undefined,
      ),
    );
  }

  /**
   * An upcoming live the viewer may see, or "not found": a missing id, one
   * no longer upcoming, a host that may not be seen, a block either way and
   * an audience that is not for the viewer are all answered the same.
   */
  private async findSeen(scheduledLiveId: string, viewerProfileId: string) {
    const live = await this.prisma.scheduledLive.findUnique({
      where: { id: scheduledLiveId },
      select: {
        id: true,
        hostId: true,
        audience: true,
        status: true,
        host: { select: HOST_SHOWN_SELECT },
      },
    });
    if (live?.status !== 'SCHEDULED') throw scheduledNotFound();
    if (live.hostId === viewerProfileId) return live;
    if (
      !hostShown(live.host) ||
      (await isBlockedEitherWay(this.prisma, viewerProfileId, live.hostId)) ||
      (live.audience !== 'EVERYONE' &&
        !(await this.isCloseFriendOf(live.hostId, viewerProfileId)))
    ) {
      throw scheduledNotFound();
    }
    return live;
  }

  private async findSeenByOther(
    scheduledLiveId: string,
    viewerProfileId: string,
  ) {
    const live = await this.findSeen(scheduledLiveId, viewerProfileId);
    if (live.hostId === viewerProfileId) {
      throw AppException.Forbidden(
        ErrorCode.LIVE_REMINDER_OWN_LIVE,
        'The host is not reminded of their own live',
      );
    }
    return live;
  }

  /** A viewer who may see an upcoming live asks to be reminded of it. */
  async remind(scheduledLiveId: string, viewerProfileId: string) {
    await this.findSeenByOther(scheduledLiveId, viewerProfileId);
    await this.prisma.scheduledLiveReminder.upsert({
      where: {
        scheduledLiveId_profileId: {
          scheduledLiveId,
          profileId: viewerProfileId,
        },
      },
      create: { scheduledLiveId, profileId: viewerProfileId },
      update: {},
    });
    return { reminded: true };
  }

  /**
   * The viewer takes back their reminder, whether or not they may still see
   * the live: answered the same in every case, it tells nothing about it.
   */
  async unremind(scheduledLiveId: string, viewerProfileId: string) {
    await this.prisma.scheduledLiveReminder.deleteMany({
      where: { scheduledLiveId, profileId: viewerProfileId },
    });
    return { reminded: false };
  }

  /**
   * Tells each Profile the notice of a live, if it is still for them: an
   * account that is active and not closed, and for a live for close friends
   * only those still on the host's list. Blocks are refused by the
   * notifications themselves. Returns those told.
   */
  private async tell(
    live: NoticeLive,
    profileIds: string[],
    message: {
      type: NotificationType;
      notice: Notice;
      targetType: string;
      targetId: string;
    },
  ): Promise<string[]> {
    if (profileIds.length === 0) return [];
    const kept = await this.prisma.profile.findMany({
      where: {
        id: { in: profileIds },
        user: { isActive: true, deactivatedAt: null },
        ...(live.audience === 'EVERYONE'
          ? {}
          : { closeFriendOf: { some: { profileId: live.hostId } } }),
      },
      select: { id: true },
    });
    const keptIds = new Set(kept.map((profile) => profile.id));
    const recipients = profileIds.filter((id) => keptIds.has(id));
    const told: string[] = [];
    for (const recipientId of recipients) {
      const notice = await this.notifications.create({
        recipientId,
        senderId: live.hostId,
        ...message,
      });
      if (notice) told.push(recipientId);
    }
    return told;
  }

  /**
   * Tells each Profile with a reminder that the scheduled live it was for
   * has started, once the host went live from it, once: the telling is
   * claimed first, only where it was not yet, so a start asked twice at
   * once tells nobody twice. Never throws: the host is on air whether or not
   * everyone was told. Returns those told.
   */
  async tellStarted(
    scheduledLiveId: string,
    streamId: string,
  ): Promise<string[]> {
    try {
      const claimed = await this.prisma.scheduledLive.updateMany({
        where: {
          id: scheduledLiveId,
          liveStreamId: streamId,
          status: 'STARTED',
          startedNotifiedAt: null,
        },
        data: { startedNotifiedAt: new Date() },
      });
      if (claimed.count !== 1) return [];
      const live = await this.prisma.scheduledLive.findUniqueOrThrow({
        where: { id: scheduledLiveId },
        select: { id: true, hostId: true, title: true, audience: true },
      });
      const told: string[] = [];
      let after: string | undefined;
      for (;;) {
        const reminders = await this.prisma.scheduledLiveReminder.findMany({
          where: { scheduledLiveId },
          select: { id: true, profileId: true },
          orderBy: { id: 'asc' },
          take: PAGE,
          ...(after ? { cursor: { id: after }, skip: 1 } : {}),
        });
        told.push(
          ...(await this.tell(
            live,
            reminders.map((reminder) => reminder.profileId),
            {
              type: NotificationType.LIVE_STARTED,
              notice: { key: 'scheduled_live_started', title: live.title },
              targetType: 'live',
              targetId: streamId,
            },
          )),
        );
        if (reminders.length < PAGE) break;
        after = reminders[reminders.length - 1].id;
      }
      return told;
    } catch (error: unknown) {
      this.logger.error(
        `The reminders of scheduled live ${scheduledLiveId} could not be told it started: ${errorText(error)}`,
      );
      return [];
    }
  }

  /**
   * Every minute, tells each Profile with a reminder of a scheduled live
   * that starts within the lead time that it starts soon, once. Each
   * reminder is claimed by setting when it was told, only where that is
   * still empty, and only the reminders claimed are told: two servers never
   * tell one twice. Never throws.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async remindSoon(now: Date = new Date()): Promise<number> {
    if (this.remindingSoon) return 0;
    this.remindingSoon = true;
    let told = 0;
    try {
      const due = {
        soonNotifiedAt: null,
        scheduledLive: {
          status: 'SCHEDULED' as const,
          startsAt: {
            lte: new Date(
              now.getTime() + LIVE_REMINDER_LEAD_MINUTES * MINUTE_MS,
            ),
          },
        },
      };
      for (;;) {
        const page = await this.prisma.scheduledLiveReminder.findMany({
          where: due,
          select: { id: true },
          orderBy: { id: 'asc' },
          take: PAGE,
        });
        if (page.length === 0) break;
        const claimed =
          await this.prisma.scheduledLiveReminder.updateManyAndReturn({
            where: {
              id: { in: page.map((reminder) => reminder.id) },
              soonNotifiedAt: null,
            },
            data: { soonNotifiedAt: now },
            select: { profileId: true, scheduledLiveId: true },
          });
        told += await this.tellSoon(claimed);
        if (page.length < PAGE) break;
      }
    } catch (error: unknown) {
      this.logger.error(
        `Telling scheduled lives soon stopped: ${errorText(error)}`,
      );
    } finally {
      this.remindingSoon = false;
    }
    return told;
  }

  private async tellSoon(
    claimed: { profileId: string; scheduledLiveId: string }[],
  ): Promise<number> {
    if (claimed.length === 0) return 0;
    const lives = await this.prisma.scheduledLive.findMany({
      where: {
        id: { in: [...new Set(claimed.map((r) => r.scheduledLiveId))] },
      },
      select: {
        id: true,
        hostId: true,
        title: true,
        audience: true,
        host: { select: HOST_SHOWN_SELECT },
      },
    });
    let told = 0;
    for (const live of lives) {
      // A host that may no longer be seen is not announced.
      if (!hostShown(live.host)) continue;
      const recipients = claimed
        .filter((reminder) => reminder.scheduledLiveId === live.id)
        .map((reminder) => reminder.profileId);
      const sent = await this.tell(live, recipients, {
        type: NotificationType.LIVE_STARTING_SOON,
        notice: { key: 'live_starting_soon', title: live.title },
        targetType: 'scheduled_live',
        targetId: live.id,
      });
      told += sent.length;
    }
    return told;
  }

  /**
   * Every minute, a scheduled live whose host has not gone live within the
   * grace time after it was due is missed, and no longer shown. Never throws.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async markMissed(now: Date = new Date()): Promise<number> {
    try {
      const missed = await this.prisma.scheduledLive.updateMany({
        where: {
          status: 'SCHEDULED',
          startsAt: {
            lt: new Date(
              now.getTime() - LIVE_SCHEDULE_GRACE_MINUTES * MINUTE_MS,
            ),
          },
        },
        data: { status: 'MISSED' },
      });
      return missed.count;
    } catch (error: unknown) {
      this.logger.error(
        `Marking missed scheduled lives stopped: ${errorText(error)}`,
      );
      return 0;
    }
  }
}
