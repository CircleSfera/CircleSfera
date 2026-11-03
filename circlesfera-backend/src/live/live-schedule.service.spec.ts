import {
  ErrorCode,
  LIVE_REMINDER_LEAD_MINUTES,
  LIVE_SCHEDULE_GRACE_MINUTES,
  LIVE_SCHEDULE_MAX_DAYS,
  LIVE_SCHEDULE_MIN_MINUTES,
  LIVE_SCHEDULED_MAX,
} from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { LiveScheduleService } from './live-schedule.service.js';

type AnyFn = (...args: any[]) => any;
type AnyArgs = Record<string, any>;

const MINUTE = 60_000;
const NOW = new Date('2026-11-03T12:00:00.000Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);

const shown = {
  isAccountBanned: false,
  suspendedUntil: null,
  user: { isActive: true, deactivatedAt: null },
};
const banned = { ...shown, isAccountBanned: true };

const row = (over: Record<string, unknown> = {}) => ({
  id: 'sl-1',
  hostId: 'host-1',
  title: 'Ensayo',
  audience: 'EVERYONE',
  startsAt: at(60),
  status: 'SCHEDULED',
  createdAt: NOW,
  ...over,
});

// The error code an AppException carries.
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    const e = error as AppException;
    return { code: e.errorCode, status: e.getStatus(), details: e.details };
  }
  throw new Error('expected a refusal');
};

describe('LiveScheduleService', () => {
  // The blocks between Profiles, as [blocker, blocked].
  let blocks: [string, string][];
  // The Profiles whose account is switched off or closed.
  let inactive: string[];
  let liveEnabled: boolean;
  // The close friends lists, as [owner, friend].
  let friends: [string, string][];
  let prisma: Record<string, any>;
  let notifications: { create: ReturnType<typeof vi.fn> };
  let service: LiveScheduleService;

  beforeEach(() => {
    blocks = [];
    friends = [];
    inactive = [];
    liveEnabled = true;
    prisma = {
      $queryRaw: vi.fn(async () => []),
      // Every Profile in one audience: no Test Account apart.
      user: { findMany: vi.fn(async () => []) },
      profile: {
        findUnique: vi.fn(async () => shown),
        // The Profiles asked for that are active and, when asked, on a
        // close friends list.
        findMany: vi.fn<AnyFn>(async ({ where }) =>
          (where.id.in as string[])
            .filter((id) => !inactive.includes(id))
            .filter(
              (id) =>
                !where.closeFriendOf ||
                friends.some(
                  ([owner, friend]) =>
                    owner === where.closeFriendOf.some.profileId &&
                    friend === id,
                ),
            )
            .map((id) => ({ id })),
        ),
      },
      block: {
        findFirst: vi.fn<AnyFn>(async ({ where }) =>
          blocks.some(([blocker, blocked]) =>
            where.OR.some(
              (side: { blockerId: string; blockedId: string }) =>
                side.blockerId === blocker && side.blockedId === blocked,
            ),
          )
            ? { id: 'b' }
            : null,
        ),
      },
      closeFriend: {
        findUnique: vi.fn<AnyFn>(async ({ where }) =>
          friends.some(
            ([owner, friend]) =>
              owner === where.profileId_friendId.profileId &&
              friend === where.profileId_friendId.friendId,
          )
            ? { id: 'cf' }
            : null,
        ),
      },
      scheduledLive: {
        count: vi.fn(async () => 0),
        create: vi.fn<AnyFn>(async ({ data }) => row(data)),
        updateMany: vi.fn(async () => ({ count: 1 })),
        findMany: vi.fn<AnyFn>(async () => []),
        findUnique: vi.fn<AnyFn>(async () => null),
        findUniqueOrThrow: vi.fn<AnyFn>(async () => ({
          id: 'sl-1',
          hostId: 'host-1',
          title: 'Ensayo',
          audience: 'EVERYONE',
        })),
      },
      scheduledLiveReminder: {
        upsert: vi.fn(async () => ({ id: 'r' })),
        deleteMany: vi.fn(async () => ({ count: 1 })),
        findMany: vi.fn<AnyFn>(async () => []),
        updateManyAndReturn: vi.fn<AnyFn>(async () => []),
      },
    };
    prisma.$transaction = vi.fn((fn: AnyFn) => fn(prisma));
    notifications = { create: vi.fn(async () => ({ id: 'n' })) };
    service = new LiveScheduleService(
      prisma as never,
      notifications as never,
      {
        isEnabled: vi.fn(async () => liveEnabled),
      } as never,
    );
  });

  describe('scheduling', () => {
    const input = {
      title: 'Ensayo',
      audience: 'EVERYONE' as const,
      startsAt: at(60).toISOString(),
    };

    it('schedules a live of the host, answered with no reminders yet', async () => {
      const made = await service.schedule('host-1', input, NOW);

      expect(prisma.scheduledLive.create).toHaveBeenCalledWith({
        data: {
          hostId: 'host-1',
          title: 'Ensayo',
          audience: 'EVERYONE',
          startsAt: at(60),
        },
        select: expect.any(Object),
      });
      expect(made).toMatchObject({
        id: 'sl-1',
        hostId: 'host-1',
        status: 'SCHEDULED',
        reminded: false,
        reminderCount: 0,
      });
    });

    it('is for everyone when no audience is given, and may be for close friends', async () => {
      await service.schedule(
        'host-1',
        { title: 'x', startsAt: input.startsAt },
        NOW,
      );
      expect(prisma.scheduledLive.create.mock.calls[0][0].data.audience).toBe(
        'EVERYONE',
      );

      await service.schedule(
        'host-1',
        { ...input, audience: 'CLOSE_FRIENDS' },
        NOW,
      );
      expect(prisma.scheduledLive.create.mock.calls[1][0].data.audience).toBe(
        'CLOSE_FRIENDS',
      );
    });

    it('schedules nothing while live streams are switched off', async () => {
      liveEnabled = false;

      await expect(service.schedule('host-1', input, NOW)).rejects.toThrow(
        'LIVE_STREAMS_DISABLED',
      );
      expect(prisma.scheduledLive.create).not.toHaveBeenCalled();
    });

    it('never schedules a practice', async () => {
      expect(
        await codeOf(
          service.schedule('host-1', { ...input, audience: 'PRACTICE' }, NOW),
        ),
      ).toMatchObject({
        code: ErrorCode.LIVE_SCHEDULE_AUDIENCE_INVALID,
        status: 400,
      });
      expect(prisma.scheduledLive.create).not.toHaveBeenCalled();
    });

    it('accepts the earliest and the furthest time allowed', async () => {
      for (const minutes of [
        LIVE_SCHEDULE_MIN_MINUTES,
        LIVE_SCHEDULE_MAX_DAYS * 24 * 60,
      ]) {
        await expect(
          service.schedule(
            'host-1',
            { ...input, startsAt: at(minutes).toISOString() },
            NOW,
          ),
        ).resolves.toBeDefined();
      }
    });

    it.each([
      ['in the past', -5],
      ['sooner than the earliest', LIVE_SCHEDULE_MIN_MINUTES - 1],
      ['further than the furthest', LIVE_SCHEDULE_MAX_DAYS * 24 * 60 + 1],
    ])('refuses a time %s, with the range', async (_name, minutes) => {
      expect(
        await codeOf(
          service.schedule(
            'host-1',
            { ...input, startsAt: at(minutes).toISOString() },
            NOW,
          ),
        ),
      ).toEqual({
        code: ErrorCode.LIVE_SCHEDULE_TIME_INVALID,
        status: 400,
        details: {
          minMinutes: LIVE_SCHEDULE_MIN_MINUTES,
          maxDays: LIVE_SCHEDULE_MAX_DAYS,
        },
      });
      expect(prisma.scheduledLive.create).not.toHaveBeenCalled();
    });

    it('refuses a time that is not one', async () => {
      expect(
        await codeOf(
          service.schedule('host-1', { ...input, startsAt: 'nope' }, NOW),
        ),
      ).toMatchObject({ code: ErrorCode.LIVE_SCHEDULE_TIME_INVALID });
    });

    it('allows one less than the limit of upcoming lives, holding the host while it counts', async () => {
      prisma.scheduledLive.count.mockResolvedValue(LIVE_SCHEDULED_MAX - 1);

      await service.schedule('host-1', input, NOW);

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.scheduledLive.count).toHaveBeenCalledWith({
        where: { hostId: 'host-1', status: 'SCHEDULED' },
      });
      expect(prisma.scheduledLive.create).toHaveBeenCalled();
    });

    it('refuses past the limit of upcoming lives', async () => {
      prisma.scheduledLive.count.mockResolvedValue(LIVE_SCHEDULED_MAX);

      expect(await codeOf(service.schedule('host-1', input, NOW))).toEqual({
        code: ErrorCode.LIVE_SCHEDULED_LIMIT,
        status: 409,
        details: { max: LIVE_SCHEDULED_MAX },
      });
      expect(prisma.scheduledLive.create).not.toHaveBeenCalled();
    });

    it('takes the time now when none is given', async () => {
      await expect(
        service.schedule('host-1', {
          ...input,
          startsAt: new Date(Date.now() + 60 * MINUTE).toISOString(),
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('cancelling', () => {
    it('cancels an upcoming live of the host, telling nobody', async () => {
      await expect(service.cancel('host-1', 'sl-1')).resolves.toEqual({
        success: true,
      });
      expect(prisma.scheduledLive.updateMany).toHaveBeenCalledWith({
        where: { id: 'sl-1', hostId: 'host-1', status: 'SCHEDULED' },
        data: { status: 'CANCELLED' },
      });
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it("answers not found for another host's live or one no longer upcoming", async () => {
      prisma.scheduledLive.updateMany.mockResolvedValue({ count: 0 });

      expect(await codeOf(service.cancel('someone', 'sl-1'))).toMatchObject({
        code: ErrorCode.SCHEDULED_LIVE_NOT_FOUND,
        status: 404,
      });
    });
  });

  describe('the upcoming lives of a Profile', () => {
    const listed = (over: Record<string, unknown> = {}) => ({
      ...row(),
      reminders: [],
      _count: { reminders: 3 },
      ...over,
    });

    it('shows the host all of their own, with how many asked to be reminded', async () => {
      prisma.scheduledLive.findMany.mockResolvedValue([listed()]);

      const lives = await service.listUpcoming('host-1', 'host-1');

      expect(prisma.profile.findUnique).not.toHaveBeenCalled();
      const args = prisma.scheduledLive.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        hostId: 'host-1',
        status: 'SCHEDULED',
        audience: { in: ['EVERYONE', 'CLOSE_FRIENDS'] },
      });
      expect(args.orderBy).toEqual({ startsAt: 'asc' });
      expect(args.take).toBe(LIVE_SCHEDULED_MAX);
      expect(lives).toEqual([
        {
          id: 'sl-1',
          hostId: 'host-1',
          title: 'Ensayo',
          audience: 'EVERYONE',
          startsAt: at(60),
          status: 'SCHEDULED',
          createdAt: NOW,
          reminded: false,
          reminderCount: 3,
        },
      ]);
    });

    it('counts for the host only the reminders of those who may still see the live', async () => {
      await service.listUpcoming('host-1', 'host-1');

      const counted =
        prisma.scheduledLive.findMany.mock.calls[0][0].select._count.select
          .reminders;
      expect(counted).toEqual({
        where: {
          profile: {
            blocking: { none: { blockedId: 'host-1' } },
            blockedBy: { none: { blockerId: 'host-1' } },
          },
          OR: [
            { scheduledLive: { audience: 'EVERYONE' } },
            { profile: { closeFriendOf: { some: { profileId: 'host-1' } } } },
          ],
        },
      });
    });

    it('shows a viewer those for everyone, with whether they asked to be reminded, and never the count', async () => {
      prisma.scheduledLive.findMany.mockResolvedValue([
        listed({ reminders: [{ id: 'r' }] }),
      ]);

      const [live] = await service.listUpcoming('host-1', 'viewer');

      const args = prisma.scheduledLive.findMany.mock.calls[0][0];
      expect(args.where.audience).toEqual({ in: ['EVERYONE'] });
      expect(args.select.reminders.where).toEqual({ profileId: 'viewer' });
      expect(live.reminded).toBe(true);
      expect(live).not.toHaveProperty('reminderCount');
    });

    it('shows a close friend those for close friends too', async () => {
      friends.push(['host-1', 'friend']);

      await service.listUpcoming('host-1', 'friend');

      expect(
        prisma.scheduledLive.findMany.mock.calls[0][0].where.audience,
      ).toEqual({ in: ['EVERYONE', 'CLOSE_FRIENDS'] });
    });

    it.each([
      ['blocked by the host', () => blocks.push(['host-1', 'viewer'])],
      ['who blocked the host', () => blocks.push(['viewer', 'host-1'])],
      [
        'of a host that may not be seen',
        () => prisma.profile.findUnique.mockResolvedValue(banned),
      ],
      [
        'of a Profile that does not exist',
        () => prisma.profile.findUnique.mockResolvedValue(null),
      ],
    ])('shows nothing to a viewer %s', async (_name, arrange) => {
      arrange();

      await expect(service.listUpcoming('host-1', 'viewer')).resolves.toEqual(
        [],
      );
      expect(prisma.scheduledLive.findMany).not.toHaveBeenCalled();
    });
  });

  describe('reminders', () => {
    const upcoming = (over: Record<string, unknown> = {}) => ({
      id: 'sl-1',
      hostId: 'host-1',
      audience: 'EVERYONE',
      status: 'SCHEDULED',
      host: shown,
      ...over,
    });

    it('reminds a viewer who may see the live, once whatever they ask', async () => {
      prisma.scheduledLive.findUnique.mockResolvedValue(upcoming());

      await expect(service.remind('sl-1', 'viewer')).resolves.toEqual({
        reminded: true,
      });
      expect(prisma.scheduledLiveReminder.upsert).toHaveBeenCalledWith({
        where: {
          scheduledLiveId_profileId: {
            scheduledLiveId: 'sl-1',
            profileId: 'viewer',
          },
        },
        create: { scheduledLiveId: 'sl-1', profileId: 'viewer' },
        update: {},
      });
    });

    it('takes a reminder back, without asking whether the live may still be seen', async () => {
      await expect(service.unremind('sl-1', 'viewer')).resolves.toEqual({
        reminded: false,
      });
      expect(prisma.scheduledLiveReminder.deleteMany).toHaveBeenCalledWith({
        where: { scheduledLiveId: 'sl-1', profileId: 'viewer' },
      });
    });

    it('reminds a close friend of a live for close friends', async () => {
      prisma.scheduledLive.findUnique.mockResolvedValue(
        upcoming({ audience: 'CLOSE_FRIENDS' }),
      );
      friends.push(['host-1', 'friend']);

      await expect(service.remind('sl-1', 'friend')).resolves.toEqual({
        reminded: true,
      });
    });

    it('never reminds the host of their own live', async () => {
      prisma.scheduledLive.findUnique.mockResolvedValue(upcoming());

      expect(await codeOf(service.remind('sl-1', 'host-1'))).toMatchObject({
        code: ErrorCode.LIVE_REMINDER_OWN_LIVE,
        status: 403,
      });
      expect(prisma.scheduledLiveReminder.upsert).not.toHaveBeenCalled();
    });

    it.each([
      ['an id that does not exist', () => null],
      ['a live no longer upcoming', () => upcoming({ status: 'STARTED' })],
      ['a live cancelled', () => upcoming({ status: 'CANCELLED' })],
      [
        'a live for close friends, to someone not on the list',
        () => upcoming({ audience: 'CLOSE_FRIENDS' }),
      ],
      [
        'a live of a host that may not be seen',
        () => upcoming({ host: banned }),
      ],
      [
        'a live of a host who blocked the viewer',
        () => {
          blocks.push(['host-1', 'viewer']);
          return upcoming();
        },
      ],
      [
        'a live of a host the viewer blocked',
        () => {
          blocks.push(['viewer', 'host-1']);
          return upcoming();
        },
      ],
    ])(
      'answers a reminder of %s as not found, the same for each, and lets one be taken back',
      async (_name, found) => {
        prisma.scheduledLive.findUnique.mockResolvedValue(found());

        expect(await codeOf(service.remind('sl-1', 'viewer'))).toEqual({
          code: ErrorCode.SCHEDULED_LIVE_NOT_FOUND,
          status: 404,
          details: undefined,
        });
        expect(prisma.scheduledLiveReminder.upsert).not.toHaveBeenCalled();
        // Taking one back is answered the same whatever the live: it tells
        // nothing about it.
        await expect(service.unremind('sl-1', 'viewer')).resolves.toEqual({
          reminded: false,
        });
        expect(prisma.scheduledLiveReminder.deleteMany).toHaveBeenCalledWith({
          where: { scheduledLiveId: 'sl-1', profileId: 'viewer' },
        });
      },
    );
  });

  describe('when the host goes live from it', () => {
    const started = {
      id: 'sl-1',
      hostId: 'host-1',
      title: 'Ensayo',
      audience: 'EVERYONE',
    };

    it('tells each Profile with a reminder that it started, with the way to the live', async () => {
      prisma.scheduledLiveReminder.findMany.mockResolvedValue([
        { id: 'r-1', profileId: 'fan-1' },
        { id: 'r-2', profileId: 'fan-2' },
      ]);
      notifications.create
        .mockResolvedValueOnce({ id: 'n' })
        // Refused, as across a block.
        .mockResolvedValueOnce(null);

      await expect(service.tellStarted('sl-1', 'stream-1')).resolves.toEqual([
        'fan-1',
      ]);
      expect(prisma.scheduledLive.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'sl-1',
          liveStreamId: 'stream-1',
          status: 'STARTED',
          startedNotifiedAt: null,
        },
        data: { startedNotifiedAt: expect.any(Date) },
      });
      expect(notifications.create).toHaveBeenCalledWith({
        recipientId: 'fan-1',
        senderId: 'host-1',
        type: 'LIVE_STARTED',
        notice: { key: 'scheduled_live_started', title: 'Ensayo' },
        targetType: 'live',
        targetId: 'stream-1',
      });
    });

    it('tells only those still on the list of a live for close friends', async () => {
      prisma.scheduledLive.findUniqueOrThrow.mockResolvedValue({
        ...started,
        audience: 'CLOSE_FRIENDS',
      });
      prisma.scheduledLiveReminder.findMany.mockResolvedValue([
        { id: 'r-1', profileId: 'friend' },
        { id: 'r-2', profileId: 'former-friend' },
      ]);
      friends.push(['host-1', 'friend']);

      await expect(service.tellStarted('sl-1', 'stream-1')).resolves.toEqual([
        'friend',
      ]);
      expect(notifications.create).toHaveBeenCalledTimes(1);
    });

    it('goes through every reminder, page after page', async () => {
      const page = Array.from({ length: 500 }, (_, i) => ({
        id: `r-${i}`,
        profileId: `fan-${i}`,
      }));
      prisma.scheduledLiveReminder.findMany
        .mockResolvedValueOnce(page)
        .mockResolvedValueOnce([{ id: 'r-last', profileId: 'fan-last' }]);

      expect(await service.tellStarted('sl-1', 'stream-1')).toHaveLength(501);
      expect(
        prisma.scheduledLiveReminder.findMany.mock.calls[1][0],
      ).toMatchObject({ cursor: { id: 'r-499' }, skip: 1 });
    });

    it('tells nobody when the live was not started from it, or its reminders were told already', async () => {
      prisma.scheduledLive.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.tellStarted('sl-1', 'stream-1')).resolves.toEqual(
        [],
      );
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('tells each reminder once when the live is started twice at once', async () => {
      // The claim as the database makes it: only the first finds it empty.
      let notifiedAt: Date | null = null;
      prisma.scheduledLive.updateMany.mockImplementation(
        async ({ where, data }: AnyArgs) => {
          await Promise.resolve();
          if (where.startedNotifiedAt !== null || notifiedAt) {
            return { count: 0 };
          }
          notifiedAt = data.startedNotifiedAt;
          return { count: 1 };
        },
      );
      prisma.scheduledLiveReminder.findMany.mockResolvedValue([
        { id: 'r-1', profileId: 'fan-1' },
      ]);

      const [first, second] = await Promise.all([
        service.tellStarted('sl-1', 'stream-1'),
        service.tellStarted('sl-1', 'stream-1'),
      ]);

      expect([...first, ...second]).toEqual(['fan-1']);
      expect(notifications.create).toHaveBeenCalledTimes(1);
    });

    it('with no reminders, asks for nobody', async () => {
      await expect(service.tellStarted('sl-1', 'stream-1')).resolves.toEqual(
        [],
      );
      expect(prisma.profile.findMany).not.toHaveBeenCalled();
    });

    it('tells nobody whose account is switched off or closed', async () => {
      prisma.scheduledLiveReminder.findMany.mockResolvedValue([
        { id: 'r-1', profileId: 'fan-1' },
        { id: 'r-2', profileId: 'gone' },
      ]);
      inactive.push('gone');

      await expect(service.tellStarted('sl-1', 'stream-1')).resolves.toEqual([
        'fan-1',
      ]);
      expect(prisma.profile.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['fan-1', 'gone'] },
          user: { isActive: true, deactivatedAt: null },
        },
        select: { id: true },
      });
    });

    it('never fails: a fault is logged and nobody else is told', async () => {
      prisma.scheduledLive.updateMany.mockRejectedValue(new Error('db down'));

      await expect(service.tellStarted('sl-1', 'stream-1')).resolves.toEqual(
        [],
      );
    });
  });

  describe('the notice that it starts soon', () => {
    const dueLive = {
      id: 'sl-1',
      hostId: 'host-1',
      title: 'Ensayo',
      audience: 'EVERYONE',
      host: shown,
    };

    it('claims the due reminders not told yet, and tells only those claimed', async () => {
      prisma.scheduledLiveReminder.findMany.mockResolvedValueOnce([
        { id: 'r-1' },
        { id: 'r-2' },
      ]);
      // Another server claimed r-2 in between.
      prisma.scheduledLiveReminder.updateManyAndReturn.mockResolvedValueOnce([
        { profileId: 'fan-1', scheduledLiveId: 'sl-1' },
      ]);
      prisma.scheduledLive.findMany.mockResolvedValueOnce([dueLive]);

      await expect(service.remindSoon(NOW)).resolves.toBe(1);

      expect(prisma.scheduledLiveReminder.findMany).toHaveBeenCalledWith({
        where: {
          soonNotifiedAt: null,
          scheduledLive: {
            status: 'SCHEDULED',
            startsAt: { lte: at(LIVE_REMINDER_LEAD_MINUTES) },
          },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 500,
      });
      expect(
        prisma.scheduledLiveReminder.updateManyAndReturn,
      ).toHaveBeenCalledWith({
        where: { id: { in: ['r-1', 'r-2'] }, soonNotifiedAt: null },
        data: { soonNotifiedAt: NOW },
        select: { profileId: true, scheduledLiveId: true },
      });
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith({
        recipientId: 'fan-1',
        senderId: 'host-1',
        type: 'LIVE_STARTING_SOON',
        notice: { key: 'live_starting_soon', title: 'Ensayo' },
        targetType: 'scheduled_live',
        targetId: 'sl-1',
      });
    });

    it('tells a reminder once: a second run finds nothing left to claim', async () => {
      prisma.scheduledLiveReminder.findMany
        .mockResolvedValueOnce([{ id: 'r-1' }])
        .mockResolvedValueOnce([]);
      prisma.scheduledLiveReminder.updateManyAndReturn.mockResolvedValueOnce([
        { profileId: 'fan-1', scheduledLiveId: 'sl-1' },
      ]);
      prisma.scheduledLive.findMany.mockResolvedValue([dueLive]);

      await service.remindSoon(NOW);
      await service.remindSoon(NOW);

      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(
        prisma.scheduledLiveReminder.updateManyAndReturn,
      ).toHaveBeenCalledTimes(1);
    });

    it('tells nothing when every reminder found was claimed by another server', async () => {
      prisma.scheduledLiveReminder.findMany.mockResolvedValueOnce([
        { id: 'r-1' },
      ]);

      await expect(service.remindSoon(NOW)).resolves.toBe(0);
      expect(prisma.scheduledLive.findMany).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('does not run twice at once on one server', async () => {
      let release: (value: unknown[]) => void = () => {};
      prisma.scheduledLiveReminder.findMany.mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        }),
      );

      const first = service.remindSoon(NOW);
      await expect(service.remindSoon(NOW)).resolves.toBe(0);
      release([]);
      await expect(first).resolves.toBe(0);
      expect(prisma.scheduledLiveReminder.findMany).toHaveBeenCalledTimes(1);
    });

    it('goes on to the next page when a page is full', async () => {
      const page = Array.from({ length: 500 }, (_, i) => ({ id: `r-${i}` }));
      prisma.scheduledLiveReminder.findMany
        .mockResolvedValueOnce(page)
        .mockResolvedValueOnce([{ id: 'r-last' }]);

      await service.remindSoon(NOW);

      expect(prisma.scheduledLiveReminder.findMany).toHaveBeenCalledTimes(2);
      expect(
        prisma.scheduledLiveReminder.updateManyAndReturn,
      ).toHaveBeenCalledTimes(2);
    });

    it('claims but does not announce the live of a host that may no longer be seen', async () => {
      prisma.scheduledLiveReminder.findMany.mockResolvedValueOnce([
        { id: 'r-1' },
      ]);
      prisma.scheduledLiveReminder.updateManyAndReturn.mockResolvedValueOnce([
        { profileId: 'fan-1', scheduledLiveId: 'sl-1' },
      ]);
      prisma.scheduledLive.findMany.mockResolvedValueOnce([
        { ...dueLive, host: banned },
      ]);

      await expect(service.remindSoon(NOW)).resolves.toBe(0);
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('tells only those still on the list of a live for close friends', async () => {
      prisma.scheduledLiveReminder.findMany.mockResolvedValueOnce([
        { id: 'r-1' },
        { id: 'r-2' },
      ]);
      prisma.scheduledLiveReminder.updateManyAndReturn.mockResolvedValueOnce([
        { profileId: 'friend', scheduledLiveId: 'sl-1' },
        { profileId: 'former-friend', scheduledLiveId: 'sl-1' },
      ]);
      prisma.scheduledLive.findMany.mockResolvedValueOnce([
        { ...dueLive, audience: 'CLOSE_FRIENDS' },
      ]);
      friends.push(['host-1', 'friend']);

      await expect(service.remindSoon(NOW)).resolves.toBe(1);
      expect(notifications.create.mock.calls[0][0].recipientId).toBe('friend');
    });

    it('never throws, and runs again after a fault', async () => {
      prisma.scheduledLiveReminder.findMany.mockRejectedValueOnce(
        new Error('db down'),
      );

      await expect(service.remindSoon(NOW)).resolves.toBe(0);
      await expect(service.remindSoon()).resolves.toBe(0);
      expect(prisma.scheduledLiveReminder.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('missed lives', () => {
    it('marks missed each upcoming live whose host has not gone live within the grace time', async () => {
      prisma.scheduledLive.updateMany.mockResolvedValue({ count: 2 });

      await expect(service.markMissed(NOW)).resolves.toBe(2);
      expect(prisma.scheduledLive.updateMany).toHaveBeenCalledWith({
        where: {
          status: 'SCHEDULED',
          startsAt: { lt: at(-LIVE_SCHEDULE_GRACE_MINUTES) },
        },
        data: { status: 'MISSED' },
      });
    });

    it('never throws, whatever the fault', async () => {
      prisma.scheduledLive.updateMany.mockRejectedValue('db down');

      await expect(service.markMissed()).resolves.toBe(0);
    });
  });
});
