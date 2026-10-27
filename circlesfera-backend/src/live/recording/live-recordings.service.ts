import * as fs from 'node:fs';
import * as path from 'node:path';
import { ErrorCode } from '@circlesfera/shared';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { LiveRecordingStatus } from '@prisma/client';
import {
  APPEAL_WINDOW_MONTHS,
  appealDeadline,
} from '../../appeals/appeal-window.js';
import { AppException } from '../../common/errors/app.exception.js';
import { canSeeProfileLives } from '../../common/policies/live-replay-access.policy.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UploadsService } from '../../uploads/uploads.service.js';
import {
  RECORDING_KEPT_DAYS,
  recordingsFolder,
} from './live-recording.constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// A recorder's file still there after this long is deleted by the nightly
// clean-up, whatever became of its replay.
const RAW_KEPT_MS = 48 * 60 * 60 * 1000;
const RAW_FILE = /^live-[0-9a-f-]{36}\.mp4$/i;
const ERASE_PAGE = 100;
const PAGE_MAX = 50;

// A replay's stream folder, and the name of the video it is recorded under.
const REPLAY_PLAYLIST = /^\/uploads\/([0-9a-f-]{36})\/master\.m3u8$/i;

/** The stored file a replay is recorded under, or null for another address. */
export function replayFileKey(replayUrl: string | null): string | null {
  const match = replayUrl ? REPLAY_PLAYLIST.exec(replayUrl) : null;
  return match ? `/uploads/${match[1]}.mp4` : null;
}

const RECORDING_SELECT = {
  id: true,
  title: true,
  startedAt: true,
  endedAt: true,
  recordingStatus: true,
  recordingDurationMs: true,
  replayUrl: true,
  thumbnailUrl: true,
  publishedAt: true,
} as const;

interface RecordingRow {
  id: string;
  title: string | null;
  startedAt: Date;
  endedAt: Date | null;
  recordingStatus: LiveRecordingStatus;
  recordingDurationMs: number | null;
  replayUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
}

/**
 * What the host does with the recordings of their broadcasts: publish one
 * on their Profile or delete it; the archive of those not yet published,
 * kept 30 days after the broadcast; and the Profile's published "Lives".
 */
@Injectable()
export class LiveRecordingsService {
  private readonly logger = new Logger(LiveRecordingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  // The days left before a recording not published is deleted.
  private daysLeft(endedAt: Date | null, now: Date): number | null {
    if (!endedAt) return null;
    const left =
      endedAt.getTime() + RECORDING_KEPT_DAYS * DAY_MS - now.getTime();
    return Math.max(0, Math.ceil(left / DAY_MS));
  }

  private view(row: RecordingRow, now: Date) {
    return {
      ...row,
      daysLeft: row.publishedAt ? null : this.daysLeft(row.endedAt, now),
    };
  }

  /**
   * Where the recording of one of the host's broadcasts is, for the summary
   * shown when it ends. A broadcast ended by staff shows none: its
   * recording is kept for their review, never offered to the host.
   */
  async getOwn(hostId: string, streamId: string, now: Date = new Date()) {
    const row = await this.prisma.liveStream.findFirst({
      where: { id: streamId, hostId },
      select: { ...RECORDING_SELECT, endedByStaff: true },
    });
    if (!row) {
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_FOUND,
        'Stream not found',
      );
    }
    const { endedByStaff, ...recording } = row;
    if (endedByStaff) {
      return {
        ...recording,
        recordingStatus: 'NONE' as const,
        recordingDurationMs: null,
        replayUrl: null,
        thumbnailUrl: null,
        publishedAt: null,
        daysLeft: null,
      };
    }
    return this.view(recording, now);
  }

  /**
   * The host's archive: the recordings of their broadcasts not published,
   * being made or ready, newest first, with the days left before each is
   * deleted.
   */
  async listArchive(hostId: string, now: Date = new Date()) {
    const rows = await this.prisma.liveStream.findMany({
      where: {
        hostId,
        status: 'ENDED',
        endedByStaff: false,
        publishedAt: null,
        recordingStatus: { in: ['PROCESSING', 'READY'] },
        endedAt: {
          gte: new Date(now.getTime() - RECORDING_KEPT_DAYS * DAY_MS),
        },
      },
      select: RECORDING_SELECT,
      orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return rows.map((row) => this.view(row, now));
  }

  /**
   * A Profile's published recordings, newest first, a page at a time, for
   * whoever may see them: none across a block, and on a private Profile
   * only for its accepted followers.
   */
  async listPublished(
    hostId: string,
    viewerProfileId: string | null,
    cursor?: string,
    limit = 12,
  ) {
    const take = Math.min(Math.max(limit, 1), PAGE_MAX);
    if (!(await canSeeProfileLives(this.prisma, hostId, viewerProfileId))) {
      return { data: [], nextCursor: null };
    }
    const rows = await this.prisma.liveStream.findMany({
      where: {
        hostId,
        endedByStaff: false,
        recordingStatus: 'READY',
        publishedAt: { not: null },
      },
      select: RECORDING_SELECT,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, take);
    return {
      data: page.map((row) => ({ ...row, daysLeft: null })),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    };
  }

  // The host's own recording, ended and ready, not of a broadcast ended by
  // staff. Any other is answered as missing or not ready.
  private async ownReady(hostId: string, streamId: string) {
    const row = await this.prisma.liveStream.findFirst({
      where: { id: streamId, hostId, endedByStaff: false },
      select: {
        status: true,
        recordingStatus: true,
        replayUrl: true,
        publishedAt: true,
      },
    });
    if (!row) {
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_FOUND,
        'Stream not found',
      );
    }
    if (row.status !== 'ENDED' || row.recordingStatus !== 'READY') {
      throw AppException.Conflict(
        ErrorCode.RECORDING_NOT_READY,
        'The recording is not ready',
      );
    }
    return row;
  }

  /** Puts the recording on the host's Profile. Publishing twice is one. */
  async publish(hostId: string, streamId: string) {
    const row = await this.ownReady(hostId, streamId);
    if (row.publishedAt) return { publishedAt: row.publishedAt };
    const publishedAt = new Date();
    await this.prisma.liveStream.updateMany({
      where: {
        id: streamId,
        hostId,
        recordingStatus: 'READY',
        publishedAt: null,
      },
      data: { publishedAt },
    });
    return { publishedAt };
  }

  /**
   * Deletes the recording, published or not. Its files are kept 30 days,
   * readable by the host only, then erased, as those of other deleted
   * content.
   */
  async remove(hostId: string, streamId: string) {
    const row = await this.ownReady(hostId, streamId);
    const changed = await this.prisma.liveStream.updateMany({
      where: { id: streamId, hostId, recordingStatus: 'READY' },
      data: {
        recordingStatus: 'NONE',
        replayUrl: null,
        thumbnailUrl: null,
        publishedAt: null,
      },
    });
    if (changed.count > 0) {
      await this.uploads.releaseContentFiles([replayFileKey(row.replayUrl)]);
    }
    return { success: true };
  }

  /**
   * Every night: deletes at once the recordings not published within 30
   * days of their broadcast (they were kept those days already), those of
   * broadcasts ended by staff once their review window (the appeal window)
   * is over, and the recorder's files left more than 48 hours. Safe on two
   * servers: each recording is taken from the state it was read in. Never
   * throws.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async eraseExpired(now: Date = new Date()): Promise<number> {
    let erased = 0;
    try {
      erased += await this.eraseReady(
        false,
        new Date(now.getTime() - RECORDING_KEPT_DAYS * DAY_MS),
        () => true,
      );
      const reviewed = new Date(now);
      reviewed.setUTCMonth(reviewed.getUTCMonth() - APPEAL_WINDOW_MONTHS);
      erased += await this.eraseReady(
        true,
        reviewed,
        (endedAt) => appealDeadline(endedAt) <= now,
      );
      await this.eraseOldRecorderFiles(now);
    } catch (error: unknown) {
      this.logger.error(
        `Deleting expired recordings stopped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.logger.log(`Deleted ${erased} expired recordings.`);
    return erased;
  }

  // Deletes, a page at a time, the ready recordings not published of
  // broadcasts that ended before the cutoff (by staff, or not) and whose
  // time is over. Answers how many.
  private async eraseReady(
    endedByStaff: boolean,
    cutoff: Date,
    over: (endedAt: Date) => boolean,
  ): Promise<number> {
    let erased = 0;
    let after: string | undefined;
    for (;;) {
      const page = await this.prisma.liveStream.findMany({
        where: {
          recordingStatus: 'READY',
          publishedAt: null,
          endedByStaff,
          endedAt: { lt: cutoff },
          ...(after ? { id: { gt: after } } : {}),
        },
        select: { id: true, hostId: true, replayUrl: true, endedAt: true },
        orderBy: { id: 'asc' },
        take: ERASE_PAGE,
      });
      if (page.length === 0) break;
      after = page[page.length - 1].id;
      for (const row of page) {
        if (!row.endedAt || !over(row.endedAt)) continue;
        try {
          const taken = await this.prisma.liveStream.updateMany({
            where: {
              id: row.id,
              recordingStatus: 'READY',
              publishedAt: null,
              endedByStaff,
            },
            data: {
              recordingStatus: 'NONE',
              replayUrl: null,
              thumbnailUrl: null,
            },
          });
          if (taken.count === 0) continue;
          await this.uploads.deleteContentFiles(row.hostId, [
            replayFileKey(row.replayUrl),
          ]);
          erased++;
        } catch (error: unknown) {
          this.logger.warn(
            `The recording of broadcast ${row.id} could not be deleted; it is tried again tomorrow: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    return erased;
  }

  // The recorder's files older than 48 hours: a replay waiting for one of
  // them is marked failed, as it will not be made any more.
  private async eraseOldRecorderFiles(now: Date): Promise<void> {
    const folder = recordingsFolder();
    const names = await fs.promises.readdir(folder).catch(() => []);
    for (const name of names) {
      if (!RAW_FILE.test(name)) continue;
      const file = path.join(folder, name);
      const stat = await fs.promises.stat(file).catch(() => null);
      if (!stat || now.getTime() - stat.mtimeMs < RAW_KEPT_MS) continue;
      await fs.promises.rm(file, { force: true });
      await this.prisma.liveStream.updateMany({
        where: { recordingFile: name, recordingStatus: 'PROCESSING' },
        data: { recordingStatus: 'FAILED' },
      });
      await this.prisma.liveStream.updateMany({
        where: { recordingFile: name },
        data: { recordingFile: null },
      });
    }
  }
}
