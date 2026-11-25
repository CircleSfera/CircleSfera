import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { SystemSettingsService } from '../../system-settings/system-settings.service.js';
import { LiveService } from '../live.service.js';
import {
  JOIN_TOKEN_TTL_SECONDS,
  LiveKitTokenService,
} from '../live-kit-token.service.js';
import type { LiveRecordingService } from '../recording/live-recording.service.js';
import {
  LiveCapacityService,
  ROOM_GRACE_MS,
  ROOMS_CACHE_MS,
  UNREAD_ROOMS_WINDOW_MS,
} from './live-capacity.service.js';

interface LiveRow {
  id: string;
  hostId: string;
  status: 'LIVE' | 'ENDED';
  startedAt: Date;
  audience: string;
}

type Where = {
  status?: string;
  hostId?: string | { not: string };
  startedAt?: { gte: Date };
  OR?: ({ id: { in: string[] } } | { startedAt: { gte: Date } })[];
};

// Lets other work waiting to run go first, as a query to the database does.
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

const fits = (row: LiveRow, where: Where = {}) =>
  (where.status === undefined || row.status === where.status) &&
  (where.hostId === undefined ||
    (typeof where.hostId === 'string'
      ? row.hostId === where.hostId
      : row.hostId !== where.hostId.not)) &&
  (where.startedAt === undefined || row.startedAt >= where.startedAt.gte) &&
  (where.OR === undefined ||
    where.OR.some((side) =>
      'id' in side
        ? side.id.in.includes(row.id)
        : row.startedAt >= side.startedAt.gte,
    ));

describe('LiveCapacityService', () => {
  let lives: LiveRow[];
  let rooms: Set<string> | null;
  let limits: Record<string, number>;
  let recorder: {
    isEnabled: ReturnType<typeof vi.fn>;
    openRooms: ReturnType<typeof vi.fn>;
    recordingsRunning: ReturnType<typeof vi.fn>;
    recordingsAtOnce: ReturnType<typeof vi.fn>;
    place: ReturnType<typeof vi.fn>;
    begin: ReturnType<typeof vi.fn>;
  };
  let capacity: LiveCapacityService;
  let live: LiveService;
  let made = 0;

  // The table of lives, and a transaction that holds the advisory lock, once
  // taken, until it ends, as Postgres's pg_advisory_xact_lock does.
  let lockTail: Promise<void>;
  const liveStream = {
    count: vi.fn(async ({ where }: { where: Where }) => {
      const n = lives.filter((row) => fits(row, where)).length;
      await tick();
      return n;
    }),
    findMany: vi.fn(async ({ where }: { where: Where }) =>
      lives.filter((row) => fits(row, where)).map(({ id }) => ({ id })),
    ),
    updateMany: vi.fn(
      async ({ where, data }: { where: Where; data: Partial<LiveRow> }) => {
        const hit = lives.filter((row) => fits(row, where));
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      },
    ),
    create: vi.fn(async ({ data }: { data: Partial<LiveRow> }) => {
      await tick();
      const row = {
        id: `new-${++made}`,
        startedAt: new Date(),
        ...data,
      } as LiveRow;
      lives.push(row);
      return row;
    }),
  };
  const prisma = {
    liveStream,
    liveGuest: { updateMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      let release = () => {};
      const tx = {
        ...prisma,
        $executeRaw: vi.fn(async () => {
          const before = lockTail;
          lockTail = new Promise<void>((resolve) => {
            release = resolve;
          });
          await before;
          return 1;
        }),
      };
      try {
        return await fn(tx);
      } finally {
        release();
      }
    }),
  };

  const onAir = (id: string, minutesAgo: number, hostId = `host-${id}`) =>
    lives.push({
      id,
      hostId,
      status: 'LIVE',
      startedAt: new Date(Date.now() - minutesAgo * 60_000),
      audience: 'EVERYONE',
    });

  beforeEach(() => {
    vi.clearAllMocks();
    lives = [];
    rooms = new Set();
    made = 0;
    lockTail = Promise.resolve();
    limits = { max_concurrent_lives: 10, max_concurrent_recordings: 2 };
    const settings = {
      isEnabled: vi.fn(async () => true),
      getNumber: vi.fn(async (key: string) => limits[key]),
    } as unknown as SystemSettingsService;
    recorder = {
      isEnabled: vi.fn(() => true),
      openRooms: vi.fn(async () => rooms),
      recordingsRunning: vi.fn(async () => 0),
      recordingsAtOnce: vi.fn(async () => limits.max_concurrent_recordings),
      place: vi.fn(async () => ({ status: 'RECORDING', partId: 'P1' })),
      begin: vi.fn(async () => 'RECORDING'),
    };
    capacity = new LiveCapacityService(
      prisma as unknown as PrismaService,
      settings,
      recorder as unknown as LiveRecordingService,
    );
    const config = {
      get: (key: string) =>
        ({
          LIVEKIT_API_KEY: 'key',
          LIVEKIT_API_SECRET: 'secret_32_bytes_long_for_the_test!',
        })[key],
    } as unknown as ConfigService;
    live = new LiveService(
      prisma as unknown as PrismaService,
      { server: { to: vi.fn().mockReturnThis(), emit: vi.fn() } } as never,
      settings,
      new LiveKitTokenService(config),
      recorder as unknown as LiveRecordingService,
      capacity,
    );
  });

  // Ten lives on air, each in its open room.
  const fill = (n: number) => {
    for (let i = 0; i < n; i++) {
      onAir(`l${i}`, 10);
      rooms?.add(`l${i}`);
    }
  };

  describe('when a live starts', () => {
    it('refuses with LIVES_FULL at the limit, and makes no live', async () => {
      fill(10);

      await expect(live.startStream('host-new', 'x')).rejects.toMatchObject({
        errorCode: 'LIVES_FULL',
        status: 409,
      });
      expect(liveStream.create).not.toHaveBeenCalled();
      expect(recorder.place).not.toHaveBeenCalled();
    });

    it('starts under the limit', async () => {
      fill(9);

      const started = await live.startStream('host-new', 'x');

      expect(started.stream.id).toBe('new-1');
      expect(lives.filter((row) => row.status === 'LIVE')).toHaveLength(10);
    });

    it('follows the limit staff set', async () => {
      fill(3);
      limits.max_concurrent_lives = 3;
      await expect(live.startStream('host-new', 'x')).rejects.toMatchObject({
        errorCode: 'LIVES_FULL',
      });

      limits.max_concurrent_lives = 4;
      await expect(live.startStream('host-new', 'x')).resolves.toBeDefined();
    });

    it('lets one of two starts at the same moment take the last place', async () => {
      fill(9);

      const results = await Promise.allSettled([
        live.startStream('host-a', 'x'),
        live.startStream('host-b', 'x'),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      const refused = results.find((r) => r.status === 'rejected');
      expect((refused as PromiseRejectedResult).reason).toMatchObject({
        errorCode: 'LIVES_FULL',
      });
      expect(lives.filter((row) => row.status === 'LIVE')).toHaveLength(10);
    });

    it("does not count the host's own live it replaces", async () => {
      fill(9);
      onAir('mine', 5, 'host-me');
      rooms?.add('mine');

      await expect(live.startStream('host-me', 'x')).resolves.toBeDefined();
      expect(lives.find((row) => row.id === 'mine')?.status).toBe('ENDED');
    });
  });

  describe('which lives hold a place', () => {
    it('not one whose room is gone at the live service: its host left without ending it', async () => {
      fill(9);
      // Marked on air an hour ago; the live service has no room for it.
      onAir('stale', 60);

      await expect(live.startStream('host-new', 'x')).resolves.toBeDefined();
    });

    it('one started while its host may still join with their token, room not open yet', async () => {
      expect(ROOM_GRACE_MS).toBeGreaterThanOrEqual(
        JOIN_TOKEN_TTL_SECONDS * 1000,
      );
      fill(9);
      // Four and a half minutes ago: the host's 5-minute token still lets
      // them in.
      onAir('reaching', 4.5);

      await expect(live.startStream('host-new', 'x')).rejects.toMatchObject({
        errorCode: 'LIVES_FULL',
      });
    });

    it('those started in the last 6 hours when the live service cannot be asked', async () => {
      fill(9);
      onAir('recent', 60);
      rooms = null;

      await expect(live.startStream('host-new', 'x')).rejects.toMatchObject({
        errorCode: 'LIVES_FULL',
      });
    });

    it('not those left on air for longer when the live service cannot be asked: they never pile up', async () => {
      for (let i = 0; i < 20; i++) onAir(`old${i}`, 7 * 60);
      fill(9);
      rooms = null;

      await expect(live.startStream('host-new', 'x')).resolves.toBeDefined();
      expect(UNREAD_ROOMS_WINDOW_MS).toBe(6 * 60 * 60 * 1000);
    });
  });

  describe('reading the rooms', () => {
    it('the screens share one reading for a few seconds; a start always reads fresh', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        await capacity.forHost('host-x');
        await capacity.forHost('host-y');
        await capacity.report();
        expect(recorder.openRooms).toHaveBeenCalledTimes(1);

        await live.startStream('host-new', 'x');
        expect(recorder.openRooms).toHaveBeenCalledTimes(2);

        vi.setSystemTime(Date.now() + ROOMS_CACHE_MS);
        await capacity.forHost('host-x');
        expect(recorder.openRooms).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it('callers do not pile up on a live service slow to answer', async () => {
      let answer: (value: Set<string> | null) => void = () => {};
      recorder.openRooms.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );

      const asked = Promise.all(
        Array.from({ length: 5 }, (_, i) => capacity.forHost(`host-${i}`)),
      );
      await tick();
      expect(recorder.openRooms).toHaveBeenCalledTimes(1);
      answer(null);
      await expect(asked).resolves.toHaveLength(5);
    });
  });

  describe('what the host is told before going live', () => {
    it('that lives are full', async () => {
      fill(10);
      await expect(capacity.forHost('host-new')).resolves.toEqual({
        livesFull: true,
        recording: 'AVAILABLE',
      });
    });

    it('not full because of their own live on air, which the start ends', async () => {
      fill(9);
      onAir('mine', 5, 'host-me');
      rooms?.add('mine');

      await expect(capacity.forHost('host-me')).resolves.toMatchObject({
        livesFull: false,
      });
      await expect(capacity.forHost('host-other')).resolves.toMatchObject({
        livesFull: true,
      });
    });

    it('that the live would not be recorded when the recorder is full', async () => {
      recorder.recordingsRunning.mockResolvedValue(2);
      await expect(capacity.forHost('host-new')).resolves.toEqual({
        livesFull: false,
        recording: 'FULL',
      });
    });

    it('nothing of recording where the environment records nothing', async () => {
      recorder.isEnabled.mockReturnValue(false);
      await expect(capacity.forHost('host-new')).resolves.toMatchObject({
        recording: 'OFF',
      });
    });

    it('when the recorder fills between the screen and the start, the live goes on and says it is not recorded', async () => {
      recorder.place.mockResolvedValueOnce({ status: 'SKIPPED_LIMIT' });

      const started = await live.startStream('host-new', 'x');

      expect(started.recording).toBe('SKIPPED_LIMIT');
      expect(started.stream.status).toBe('LIVE');
      expect(recorder.begin).not.toHaveBeenCalled();
    });
  });

  describe('report', () => {
    it('counts lives and recordings against their limits, and the lives left without a room', async () => {
      fill(4);
      onAir('stale', 60);
      recorder.recordingsRunning.mockResolvedValue(1);

      await expect(capacity.report()).resolves.toMatchObject({
        lives: { onAir: 4, limit: 10, withoutRoom: 1, roomsRead: true },
        recordings: { running: 1, limit: 2, enabled: true },
      });
    });

    it('says when the rooms could not be read', async () => {
      fill(2);
      rooms = null;
      await expect(capacity.report()).resolves.toMatchObject({
        lives: { onAir: 2, withoutRoom: 0, roomsRead: false },
      });
    });
  });
});
