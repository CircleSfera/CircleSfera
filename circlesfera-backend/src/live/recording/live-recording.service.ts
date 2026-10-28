import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type {
  LiveRecordingPartStatus,
  LiveRecordingRole,
} from '@prisma/client';
import {
  AudioCodec,
  EgressClient,
  type EgressInfo,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptions,
  RoomServiceClient,
  ServerError,
  VideoCodec,
} from 'livekit-server-sdk';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UploadsService } from '../../uploads/uploads.service.js';
import {
  COHOST_PARTS_MAX,
  coHostFileName,
  hostFileName,
  RECORDER_FOLDER,
  RECORDING_ENCODING,
  RECORDING_MAX_MS,
  RECORDINGS_AT_ONCE_DEFAULT,
  recordingsFolder,
} from './live-recording.constants.js';

// The lock that lets one server at a time count the running recordings and
// take a place among them.
const RECORDING_PLACES_LOCK = 7_340_001;
// A part whose job the recorder never answered for after this long.
const START_LOST_MS = 2 * 60 * 1000;
// A part the recorder no longer knows, after the broadcast ended this long
// ago (or ran past its longest), is given up.
const UNKNOWN_GIVEN_UP_MS = 60 * 60 * 1000;
const POLL_PAGE = 50;

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// The recorder refuses to stop a job that is already ending or over; for a
// stop, that is what was wanted.
const alreadyStopped = (error: unknown): boolean =>
  error instanceof ServerError &&
  (error.code === 'failed_precondition' ||
    error.code === 'not_found' ||
    /EGRESS_(ENDING|COMPLETE|FAILED|ABORTED|LIMIT_REACHED)/.test(
      error.message,
    ));

const nsToMs = (ns: bigint): number => Number(ns / 1_000_000n);

interface Part {
  id: string;
  role: LiveRecordingRole;
  egressId: string | null;
  file: string;
  status: LiveRecordingPartStatus;
  startedAt: Date;
}

interface RunningStream {
  id: string;
  status: string;
  endedAt: Date | null;
  recordingStartedAt: Date | null;
  recordingParts: Part[];
}

/**
 * Records broadcasts with the environment's own recorder (LiveKit egress),
 * keeping what each person already sends: the host's camera and microphone
 * in one MP4 file, and each co-host's in files of their own, in the
 * recorder's folder. No browser films the screen; the replay composes the
 * parts afterwards. Switched on by LIVE_RECORDING_ENABLED, only where the
 * environment runs its own recorder. Nothing here stops a broadcast: a
 * recording that cannot be made leaves the broadcast as it is.
 */
@Injectable()
export class LiveRecordingService {
  private readonly logger = new Logger(LiveRecordingService.name);
  private egressClient?: EgressClient;
  private roomClient?: RoomServiceClient;
  // One check at a time on this server: a slow recorder must not make the
  // minute's checks overlap.
  private checking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * On only when switched on and the live service is not the hosted one:
   * recordings are made on CircleSfera's own server, never by a paid service.
   */
  isEnabled(): boolean {
    if (this.config.get<string>('LIVE_RECORDING_ENABLED') !== 'true') {
      return false;
    }
    const hosted = /\.livekit\.cloud(?::\d+)?(?:\/|$)/i;
    return ![this.apiUrl(), this.config.get<string>('LIVEKIT_URL') ?? ''].some(
      (url) => hosted.test(url),
    );
  }

  /**
   * How many broadcasts are recorded at once: LIVE_RECORDINGS_AT_ONCE, a
   * whole number from 1, or 1 when it says nothing usable.
   */
  recordingsAtOnce(): number {
    const value = Number(this.config.get<string>('LIVE_RECORDINGS_AT_ONCE'));
    return Number.isInteger(value) && value >= 1
      ? value
      : RECORDINGS_AT_ONCE_DEFAULT;
  }

  // The live service's address for its API: LIVEKIT_API_URL, or the address
  // browsers use, with http in place of ws.
  private apiUrl(): string {
    const explicit = this.config.get<string>('LIVEKIT_API_URL');
    if (explicit) return explicit;
    return (this.config.get<string>('LIVEKIT_URL') ?? '').replace(
      /^ws(s?):\/\//i,
      'http$1://',
    );
  }

  private credentials(): [string, string] {
    return [
      this.config.get<string>('LIVEKIT_API_KEY') ?? '',
      this.config.get<string>('LIVEKIT_API_SECRET') ?? '',
    ];
  }

  private egress(): EgressClient {
    this.egressClient ??= new EgressClient(
      this.apiUrl(),
      ...this.credentials(),
    );
    return this.egressClient;
  }

  private rooms(): RoomServiceClient {
    this.roomClient ??= new RoomServiceClient(
      this.apiUrl(),
      ...this.credentials(),
    );
    return this.roomClient;
  }

  // Stops one job; one already ending or over counts as stopped.
  private async stopJob(egressId: string): Promise<void> {
    try {
      await this.egress().stopEgress(egressId);
    } catch (error: unknown) {
      if (!alreadyStopped(error)) throw error;
    }
  }

  private async removeFiles(files: string[]): Promise<void> {
    for (const file of files) {
      await fs.promises
        .rm(path.join(recordingsFolder(), file), { force: true })
        .catch(() => undefined);
    }
  }

  /**
   * Stops every job the recorder runs for a broadcast's room that no part
   * being recorded holds, and deletes the given files, for a start this
   * server lost track of (refused, timed out, or never answered): such a job
   * must not run on, nor leave a file. A file the recorder closes after this
   * is left to the nightly clean-up. Never throws.
   */
  private async stopStrayJobs(
    streamId: string,
    files: string[],
  ): Promise<void> {
    try {
      const held = await this.prisma.liveRecordingPart.findMany({
        where: { streamId, status: 'RECORDING', egressId: { not: null } },
        select: { egressId: true },
      });
      const kept = new Set(held.map((part) => part.egressId));
      const jobs = await this.egress().listEgress({
        roomName: streamId,
        active: true,
      });
      for (const job of jobs) {
        if (!kept.has(job.egressId)) await this.stopJob(job.egressId);
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Stray recordings of broadcast ${streamId} could not be stopped: ${errorText(error)}`,
      );
    }
    await this.removeFiles(files);
  }

  /**
   * Asks the recorder to record one person's camera and microphone, as they
   * send them, to the part's file. A job that answers after its part was
   * given up is stopped at once.
   */
  private async startPart(
    streamId: string,
    identity: string,
    part: { id: string; file: string },
  ): Promise<void> {
    const info = await this.egress().startParticipantEgress(
      streamId,
      identity,
      {
        file: new EncodedFileOutput({
          fileType: EncodedFileType.MP4,
          filepath: `${RECORDER_FOLDER}/${part.file}`,
        }),
      },
      {
        encodingOptions: new EncodingOptions({
          width: RECORDING_ENCODING.width,
          height: RECORDING_ENCODING.height,
          framerate: RECORDING_ENCODING.framerate,
          videoCodec: VideoCodec.H264_MAIN,
          videoBitrate: RECORDING_ENCODING.videoBitrateKbps,
          keyFrameInterval: RECORDING_ENCODING.keyFrameIntervalSec,
          audioCodec: AudioCodec.AAC,
          audioBitrate: RECORDING_ENCODING.audioBitrateKbps,
        }),
      },
    );
    const attached = await this.prisma.liveRecordingPart.updateMany({
      where: { id: part.id, status: 'RECORDING', egressId: null },
      data: { egressId: info.egressId },
    });
    if (attached.count === 0) {
      // The minute check gave this part up while the recorder was still
      // answering: the job it started is tracked by no row.
      this.logger.warn(
        `Recording ${part.file} was given up before its job started: stopping it`,
      );
      await this.stopJob(info.egressId);
      await this.removeFiles([part.file]);
      return;
    }
    this.logger.log(`Recording ${part.file} (${info.egressId})`);
  }

  /**
   * Starts recording a broadcast that has just begun, from its host's camera
   * and microphone, if recording is on and the recorder has a free place;
   * otherwise marks it as not recorded for the limit. Never throws.
   */
  async start(streamId: string, hostProfileId: string): Promise<void> {
    if (!this.isEnabled()) return;
    const file = hostFileName(streamId);
    let partId: string;
    try {
      // Counted and taken under one lock: two broadcasts starting at the
      // same moment on two servers cannot both take the last place.
      const part = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RECORDING_PLACES_LOCK})`;
        // Only broadcasts still on air take a place: one that ended is
        // over for the recorder, even while the minute check has not
        // settled its files yet. A broadcast started and ended at once (the
        // deploy's check, a host who leaves) would otherwise keep the next
        // one unrecorded until then.
        const running = await tx.liveStream.count({
          where: { recordingStatus: 'RECORDING', status: 'LIVE' },
        });
        const free = running < this.recordingsAtOnce();
        await tx.liveStream.update({
          where: { id: streamId },
          data: free
            ? { recordingStatus: 'RECORDING', recordingStartedAt: new Date() }
            : { recordingStatus: 'SKIPPED_LIMIT' },
        });
        if (!free) return null;
        return tx.liveRecordingPart.create({
          data: { streamId, role: 'HOST', file },
          select: { id: true },
        });
      });
      if (!part) {
        this.logger.log(`Broadcast ${streamId} not recorded: recorder full`);
        return;
      }
      partId = part.id;
    } catch (error: unknown) {
      this.logger.error(
        `The recording of broadcast ${streamId} could not be placed: ${errorText(error)}`,
      );
      return;
    }

    try {
      // The recorder joins a room that exists: it is made now, before the
      // host's device joins it.
      await this.rooms().createRoom({ name: streamId, emptyTimeout: 300 });
      await this.startPart(streamId, hostProfileId, { id: partId, file });
    } catch (error: unknown) {
      this.logger.error(
        `The recording of broadcast ${streamId} could not start: ${errorText(error)}`,
      );
      // The recorder may have started the job all the same.
      await this.failPart(partId).catch(() => undefined);
      await this.stopStrayJobs(streamId, [file]);
      await this.markFailed(streamId).catch(() => undefined);
    }
  }

  /**
   * Starts recording a co-host who has just joined a broadcast being
   * recorded, as a part of its own. A co-host already being recorded is not
   * recorded twice; one who joins again has a new part. Never throws.
   */
  async startCoHost(streamId: string, coHostProfileId: string): Promise<void> {
    if (!this.isEnabled()) return;
    let part: { id: string; file: string };
    try {
      const stream = await this.prisma.liveStream.findUnique({
        where: { id: streamId },
        select: {
          status: true,
          recordingStatus: true,
          recordingParts: {
            where: { role: 'COHOST' },
            select: { egressId: true, status: true },
          },
        },
      });
      if (stream?.status !== 'LIVE' || stream.recordingStatus !== 'RECORDING') {
        return;
      }
      const parts = stream.recordingParts;
      if (parts.length >= COHOST_PARTS_MAX) return;
      for (const other of parts) {
        if (other.status === 'RECORDING' && (await this.running(other))) {
          return;
        }
      }
      // Two joins at the same moment name the same file: one of them is
      // refused by the file's uniqueness.
      part = await this.prisma.liveRecordingPart.create({
        data: {
          streamId,
          role: 'COHOST',
          file: coHostFileName(streamId, parts.length + 1),
        },
        select: { id: true, file: true },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `The co-host of broadcast ${streamId} could not be placed for recording: ${errorText(error)}`,
      );
      return;
    }

    try {
      await this.startPart(streamId, coHostProfileId, part);
    } catch (error: unknown) {
      this.logger.error(
        `The co-host of broadcast ${streamId} could not be recorded: ${errorText(error)}`,
      );
      await this.failPart(part.id).catch(() => undefined);
      await this.stopStrayJobs(streamId, [part.file]);
    }
  }

  // Whether a part's job is still being started or recording.
  private async running(part: { egressId: string | null }): Promise<boolean> {
    // Not answered yet: still being started.
    if (!part.egressId) return true;
    const [info] = await this.egress().listEgress({ egressId: part.egressId });
    return (
      info?.status === EgressStatus.EGRESS_STARTING ||
      info?.status === EgressStatus.EGRESS_ACTIVE
    );
  }

  /**
   * Asks the recorder to finish the co-host's part of a broadcast, when the
   * co-host leaves it. Never throws: a part not stopped now ends when the
   * co-host's device leaves, or with the broadcast.
   */
  async stopCoHost(streamId: string): Promise<void> {
    await this.stopParts(streamId, 'COHOST');
  }

  /**
   * Asks the recorder to finish every part of the recording of a broadcast
   * that ended. The recorder closes the files; the check below takes them
   * from there. Never throws: a part not stopped now is stopped by that
   * check.
   */
  async stop(streamId: string): Promise<void> {
    await this.stopParts(streamId);
  }

  private async stopParts(
    streamId: string,
    role?: LiveRecordingRole,
  ): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const parts = await this.prisma.liveRecordingPart.findMany({
        where: {
          streamId,
          status: 'RECORDING',
          egressId: { not: null },
          ...(role ? { role } : {}),
        },
        select: { egressId: true },
      });
      // Only parts with a job are read.
      for (const part of parts) await this.stopJob(part.egressId as string);
    } catch (error: unknown) {
      this.logger.warn(
        `The recording of broadcast ${streamId} could not be stopped now: ${errorText(error)}`,
      );
    }
  }

  /**
   * Every minute, asks the recorder about each part of each running
   * recording: stops the parts of a broadcast that ended or reached its
   * longest (and a co-host's once the host's is over), takes the file of a
   * part that finished, and gives up a part that failed or was lost. A
   * recording whose parts are all over is made into its replay, when the
   * host's part holds a file. A recording still waiting for its replay with
   * no job kept for it is asked for again.
   * Safe on two servers: each change is made only from the state it was
   * read in. Never throws.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async check(now: Date = new Date()): Promise<number> {
    if (!this.isEnabled() || this.checking) return 0;
    this.checking = true;
    let finished = 0;
    try {
      const running = await this.prisma.liveStream.findMany({
        where: { recordingStatus: 'RECORDING' },
        select: {
          id: true,
          status: true,
          endedAt: true,
          recordingStartedAt: true,
          recordingParts: {
            select: {
              id: true,
              role: true,
              egressId: true,
              file: true,
              status: true,
              startedAt: true,
            },
            orderBy: { startedAt: 'asc' },
          },
        },
        orderBy: { recordingStartedAt: 'asc' },
        take: POLL_PAGE,
      });
      for (const stream of running) {
        try {
          if (await this.checkOne(stream, now)) finished++;
        } catch (error: unknown) {
          this.logger.warn(
            `The recording of broadcast ${stream.id} could not be checked: ${errorText(error)}`,
          );
        }
      }
      // A recording whose replay was never asked for, or whose job is gone.
      const waiting = await this.prisma.liveStream.findMany({
        where: { recordingStatus: 'PROCESSING' },
        select: { id: true },
        take: POLL_PAGE,
      });
      for (const stream of waiting) {
        await this.uploads
          .recoverLiveReplay(stream.id)
          .catch((error: unknown) =>
            this.logger.warn(
              `The replay of broadcast ${stream.id} could not be asked for: ${errorText(error)}`,
            ),
          );
      }
    } catch (error: unknown) {
      this.logger.error(`Checking the recordings stopped: ${errorText(error)}`);
    } finally {
      this.checking = false;
    }
    return finished;
  }

  private async checkOne(stream: RunningStream, now: Date): Promise<boolean> {
    const startedAt = stream.recordingStartedAt?.getTime() ?? 0;
    const over =
      stream.status === 'ENDED' ||
      now.getTime() - startedAt >= RECORDING_MAX_MS;
    // The host's part first: a co-host's is stopped once the host's is over.
    const host = stream.recordingParts.find((part) => part.role === 'HOST');
    let hostStatus = host?.status ?? 'FAILED';
    if (host && hostStatus === 'RECORDING') {
      hostStatus = await this.checkPart(stream, host, over, now);
    }
    for (const part of stream.recordingParts) {
      if (part.role !== 'COHOST' || part.status !== 'RECORDING') continue;
      await this.checkPart(
        stream,
        part,
        over || hostStatus !== 'RECORDING',
        now,
      );
    }
    return this.finish(stream.id);
  }

  private async checkPart(
    stream: RunningStream,
    part: Part,
    stopNow: boolean,
    now: Date,
  ): Promise<LiveRecordingPartStatus> {
    if (!part.egressId) {
      // The server that started it stopped before the recorder answered.
      if (now.getTime() - part.startedAt.getTime() > START_LOST_MS) {
        const given = await this.failPart(part.id, { egressId: null });
        if (given.count > 0) {
          await this.stopStrayJobs(stream.id, [part.file]);
          return 'FAILED';
        }
      }
      return 'RECORDING';
    }
    const [info] = await this.egress().listEgress({ egressId: part.egressId });
    if (!info) {
      const since =
        stream.endedAt?.getTime() ??
        (stream.recordingStartedAt?.getTime() ?? 0) + RECORDING_MAX_MS;
      if (now.getTime() - since > UNKNOWN_GIVEN_UP_MS) {
        await this.failPart(part.id, { egressId: part.egressId });
        return 'FAILED';
      }
      return 'RECORDING';
    }
    switch (info.status) {
      case EgressStatus.EGRESS_STARTING:
      case EgressStatus.EGRESS_ACTIVE:
        if (stopNow) await this.stopJob(part.egressId);
        return 'RECORDING';
      case EgressStatus.EGRESS_COMPLETE:
      case EgressStatus.EGRESS_LIMIT_REACHED:
        return this.takePart(part, part.egressId, info, now);
      case EgressStatus.EGRESS_FAILED:
      case EgressStatus.EGRESS_ABORTED:
        this.logger.warn(`Recording ${part.file} failed: ${info.error}`);
        await this.failPart(part.id, { egressId: part.egressId });
        return 'FAILED';
      default:
        // Ending: the recorder is closing the file.
        return 'RECORDING';
    }
  }

  // The file the recorder wrote for a part, if it is the one asked for and
  // holds something, with the moments it began and ended.
  private async takePart(
    part: Part,
    egressId: string,
    info: EgressInfo,
    now: Date,
  ): Promise<LiveRecordingPartStatus> {
    const result = info.fileResults[0];
    const file = result ? path.posix.basename(result.filename) : '';
    if (!result || file !== part.file || result.size <= 0n) {
      this.logger.warn(`Recording ${part.file} ended with no usable file`);
      await this.failPart(part.id, { egressId });
      return 'FAILED';
    }
    await this.prisma.liveRecordingPart.updateMany({
      where: { id: part.id, status: 'RECORDING', egressId },
      data: {
        status: 'DONE',
        durationMs: nsToMs(result.duration),
        sizeBytes: result.size,
        ...(result.startedAt > 0n
          ? { startedAt: new Date(nsToMs(result.startedAt)) }
          : {}),
        endedAt: result.endedAt > 0n ? new Date(nsToMs(result.endedAt)) : now,
      },
    });
    return 'DONE';
  }

  /**
   * A recording whose parts are all over: made into its replay when the
   * host's part holds a file, given up otherwise (its other files deleted).
   */
  private async finish(streamId: string): Promise<boolean> {
    const parts = await this.prisma.liveRecordingPart.findMany({
      where: { streamId },
      select: {
        role: true,
        file: true,
        status: true,
        durationMs: true,
        sizeBytes: true,
      },
    });
    if (parts.some((part) => part.status === 'RECORDING')) return false;
    const done = parts.filter((part) => part.status === 'DONE');
    const host = done.find((part) => part.role === 'HOST');
    if (!host) {
      const given = await this.markFailed(streamId);
      if (given.count > 0) {
        this.logger.warn(
          `The recording of broadcast ${streamId} has no file of its host`,
        );
        await this.removeFiles(done.map((part) => part.file));
      }
      return false;
    }
    const taken = await this.prisma.liveStream.updateMany({
      where: { id: streamId, recordingStatus: 'RECORDING' },
      data: {
        recordingStatus: 'PROCESSING',
        recordingFile: host.file,
        recordingDurationMs: host.durationMs,
        recordingSizeBytes: done.reduce(
          (sum, part) => sum + (part.sizeBytes ?? 0n),
          0n,
        ),
      },
    });
    if (taken.count === 0) return false;
    this.logger.log(`Recording of broadcast ${streamId} finished`);
    // Not asked now, it is asked again by the next check.
    await this.uploads
      .enqueueLiveReplay(streamId)
      .catch((error: unknown) =>
        this.logger.warn(
          `The replay of broadcast ${streamId} could not be asked for now: ${errorText(error)}`,
        ),
      );
    return true;
  }

  private failPart(partId: string, where: { egressId?: string | null } = {}) {
    return this.prisma.liveRecordingPart.updateMany({
      where: { id: partId, status: 'RECORDING', ...where },
      data: { status: 'FAILED', endedAt: new Date() },
    });
  }

  private markFailed(streamId: string) {
    return this.prisma.liveStream.updateMany({
      where: { id: streamId, recordingStatus: 'RECORDING' },
      data: { recordingStatus: 'FAILED' },
    });
  }
}
