import { ErrorCode } from '@circlesfera/shared';
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SYSTEM_SETTING_KEYS } from '../../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../../system-settings/system-settings.service.js';
import { JOIN_TOKEN_TTL_SECONDS } from '../live-kit-token.service.js';
import { LiveRecordingService } from '../recording/live-recording.service.js';

// The lock that lets one start at a time count the lives on air and take a
// place among them, on any server. The recorder's places use 7_340_001.
const LIVE_PLACES_LOCK = 7_340_002;

/**
 * How long a live just started holds a place before its room is open at the
 * live service: as long as the host's join token is valid (they may join at
 * any moment of it), and a minute more for the join itself.
 */
export const ROOM_GRACE_MS = JOIN_TOKEN_TTL_SECONDS * 1000 + 60 * 1000;

/**
 * When the live service cannot be asked, the lives marked on air that still
 * hold a place: those started in the last 6 hours. Longer than the longest
 * recording (4 hours) with room to spare, so a real long live is counted;
 * short enough that lives left marked on air by a host who never ended them
 * cannot pile up and keep every host off the air.
 */
export const UNREAD_ROOMS_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * How long one reading of the live service's rooms answers the go-live
 * screen and the Operations page: the screen asks every 30 seconds per host.
 * A start never uses it.
 */
export const ROOMS_CACHE_MS = 5 * 1000;

/** Whether a live started now would be recorded. */
export type RecordingOutlook = 'AVAILABLE' | 'FULL' | 'OFF';

/** What the host's go-live screen is told before going live. */
export interface LiveCapacityAnswer {
  livesFull: boolean;
  recording: RecordingOutlook;
}

/** The lives and recordings against their limits, for the Operations page. */
export interface LiveCapacityReport {
  generatedAt: string;
  lives: {
    onAir: number;
    limit: number;
    // Marked on air but with no room at the live service: their host left
    // without ending them. They hold no place. 0 when the rooms could not
    // be read.
    withoutRoom: number;
    // False when the live service could not be asked: the lives marked on
    // air in the last UNREAD_ROOMS_WINDOW_MS are counted.
    roomsRead: boolean;
  };
  recordings: { running: number; limit: number; enabled: boolean };
}

/** Where a live about to start is counted, read before its transaction. */
export interface LivePlaceCheck {
  where: Prisma.LiveStreamWhereInput;
  limit: number;
}

type Client = Pick<Prisma.TransactionClient, 'liveStream' | '$executeRaw'>;

const livesFull = () =>
  AppException.Conflict(
    ErrorCode.LIVES_FULL,
    'As many lives are on air as the live server takes: try again in a few minutes',
  );

/**
 * How many lives and recordings run at once on CircleSfera's own live
 * server, against the limits staff set (PD-092): a live that would pass its
 * limit is refused; one past the recordings' limit goes on unrecorded.
 */
@Injectable()
export class LiveCapacityService {
  private readonly logger = new Logger(LiveCapacityService.name);
  // One reading of the rooms, shared by every caller while it is under
  // ROOMS_CACHE_MS old, answered or not: callers never pile up on a live
  // service that is slow (each reading gives up after 3 seconds).
  private roomsRead?: { at: number; rooms: Promise<Set<string> | null> };

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService,
    private readonly recording: LiveRecordingService,
  ) {}

  livesAtOnce(): Promise<number> {
    return this.systemSettings.getNumber(
      SYSTEM_SETTING_KEYS.MAX_CONCURRENT_LIVES,
    );
  }

  // The rooms read a moment ago, for the screens; a start reads them fresh.
  private recentRooms(now: number): Promise<Set<string> | null> {
    if (!this.roomsRead || now - this.roomsRead.at >= ROOMS_CACHE_MS) {
      this.roomsRead = { at: now, rooms: this.recording.openRooms() };
    }
    return this.roomsRead.rooms;
  }

  /**
   * Which lives marked on air hold a place, from the rooms open at the live
   * service: those whose room is open, and those started within
   * ROOM_GRACE_MS. A live whose room is gone (its host's app was closed
   * without ending it) holds none. When the live service could not be asked,
   * those started within UNREAD_ROOMS_WINDOW_MS.
   */
  onAirWhere(
    rooms: Set<string> | null,
    now: Date = new Date(),
  ): { where: Prisma.LiveStreamWhereInput; roomsRead: boolean } {
    const since = (ms: number) => new Date(now.getTime() - ms);
    if (!rooms) {
      this.logger.warn(
        'Lives counted without the live service: those started in the last 6 hours',
      );
      return {
        where: {
          status: 'LIVE',
          startedAt: { gte: since(UNREAD_ROOMS_WINDOW_MS) },
        },
        roomsRead: false,
      };
    }
    return {
      where: {
        status: 'LIVE',
        OR: [
          { id: { in: [...rooms] } },
          { startedAt: { gte: since(ROOM_GRACE_MS) } },
        ],
      },
      roomsRead: true,
    };
  }

  /**
   * What a start counts against: read before its transaction, as it asks
   * the live service (fresh, never the screens' reading) and the settings.
   */
  async placeCheck(now: Date = new Date()): Promise<LivePlaceCheck> {
    const [rooms, limit] = await Promise.all([
      this.recording.openRooms(),
      this.livesAtOnce(),
    ]);
    return { where: this.onAirWhere(rooms, now).where, limit };
  }

  /**
   * In a live's start transaction, before the live is made: counts the lives
   * holding a place under one lock, held until the transaction ends, and
   * refuses with LIVES_FULL at the limit. Two starts at the same moment, on
   * any server, cannot both take the last place.
   */
  async takePlace(tx: Client, check: LivePlaceCheck): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LIVE_PLACES_LOCK})`;
    const onAir = await tx.liveStream.count({ where: check.where });
    if (onAir >= check.limit) throw livesFull();
  }

  /** Whether the recorder has a place, or records nothing here. */
  private async recordingOutlook(): Promise<RecordingOutlook> {
    if (!this.recording.isEnabled()) return 'OFF';
    const [running, limit] = await Promise.all([
      this.recording.recordingsRunning(),
      this.recording.recordingsAtOnce(),
    ]);
    return running >= limit ? 'FULL' : 'AVAILABLE';
  }

  /**
   * What the host is told before going live: whether lives are full, and
   * whether the live would be recorded. The host's own live on air is not
   * counted, as the start ends it. A guide only: the start checks again.
   */
  async forHost(hostProfileId: string): Promise<LiveCapacityAnswer> {
    const now = new Date();
    const [rooms, limit, recording] = await Promise.all([
      this.recentRooms(now.getTime()),
      this.livesAtOnce(),
      this.recordingOutlook(),
    ]);
    const { where } = this.onAirWhere(rooms, now);
    const onAir = await this.prisma.liveStream.count({
      where: { ...where, hostId: { not: hostProfileId } },
    });
    return { livesFull: onAir >= limit, recording };
  }

  /** The counts against their limits, for staff. */
  async report(): Promise<LiveCapacityReport> {
    const now = new Date();
    const [rooms, livesLimit] = await Promise.all([
      this.recentRooms(now.getTime()),
      this.livesAtOnce(),
    ]);
    const { where, roomsRead } = this.onAirWhere(rooms, now);
    const enabled = this.recording.isEnabled();
    const [onAir, marked, running, recordingsLimit] = await Promise.all([
      this.prisma.liveStream.count({ where }),
      this.prisma.liveStream.count({ where: { status: 'LIVE' } }),
      this.recording.recordingsRunning(),
      this.recording.recordingsAtOnce(),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      lives: {
        onAir,
        limit: livesLimit,
        // Only known from the rooms: when they could not be read, the lives
        // left out are those older than UNREAD_ROOMS_WINDOW_MS, whose rooms
        // nobody knows, and none is said to have no room.
        withoutRoom: roomsRead ? Math.max(0, marked - onAir) : 0,
        roomsRead,
      },
      recordings: { running, limit: recordingsLimit, enabled },
    };
  }
}
