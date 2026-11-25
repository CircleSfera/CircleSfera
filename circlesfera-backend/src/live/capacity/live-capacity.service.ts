import { ErrorCode } from '@circlesfera/shared';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SYSTEM_SETTING_KEYS } from '../../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../../system-settings/system-settings.service.js';
import { LiveRecordingService } from '../recording/live-recording.service.js';

// The lock that lets one start at a time count the lives on air and take a
// place among them, on any server. The recorder's places use 7_340_001.
const LIVE_PLACES_LOCK = 7_340_002;

/**
 * How long a live just started holds a place before its room is open at the
 * live service: the host's device is still reaching it.
 */
export const ROOM_GRACE_MS = 2 * 60 * 1000;

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
    // without ending them. They hold no place.
    withoutRoom: number;
    // False when the live service could not be asked: every live marked on
    // air is counted.
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

  /**
   * Which lives marked on air hold a place: those whose room is open at the
   * live service, and those started within ROOM_GRACE_MS. A live whose room
   * is gone (its host's app was closed without ending it) holds none. When
   * the live service cannot be asked, every live marked on air holds one.
   */
  async onAirWhere(
    now: Date = new Date(),
  ): Promise<{ where: Prisma.LiveStreamWhereInput; roomsRead: boolean }> {
    const rooms = await this.recording.openRooms();
    if (!rooms) return { where: { status: 'LIVE' }, roomsRead: false };
    return {
      where: {
        status: 'LIVE',
        OR: [
          { id: { in: [...rooms] } },
          { startedAt: { gte: new Date(now.getTime() - ROOM_GRACE_MS) } },
        ],
      },
      roomsRead: true,
    };
  }

  /**
   * What a start counts against: read before its transaction, as it asks
   * the live service and the settings.
   */
  async placeCheck(now: Date = new Date()): Promise<LivePlaceCheck> {
    const [{ where }, limit] = await Promise.all([
      this.onAirWhere(now),
      this.livesAtOnce(),
    ]);
    return { where, limit };
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
   * whether the live would be recorded. A guide only: the start itself
   * checks again.
   */
  async forHost(): Promise<LiveCapacityAnswer> {
    const [check, recording] = await Promise.all([
      this.placeCheck(),
      this.recordingOutlook(),
    ]);
    const onAir = await this.prisma.liveStream.count({ where: check.where });
    return { livesFull: onAir >= check.limit, recording };
  }

  /** The counts against their limits, for staff. */
  async report(): Promise<LiveCapacityReport> {
    const [{ where, roomsRead }, livesLimit] = await Promise.all([
      this.onAirWhere(),
      this.livesAtOnce(),
    ]);
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
        withoutRoom: Math.max(0, marked - onAir),
        roomsRead,
      },
      recordings: { running, limit: recordingsLimit, enabled },
    };
  }
}
