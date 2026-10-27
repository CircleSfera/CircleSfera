import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AudioCodec,
  EgressClient,
  type EgressInfo,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptions,
  RoomServiceClient,
  VideoCodec,
} from 'livekit-server-sdk';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  RECORDER_FOLDER,
  RECORDING_ENCODING,
  RECORDING_MAX_MS,
  RECORDINGS_AT_ONCE,
  recordingFileName,
} from './live-recording.constants.js';

// The lock that lets one server at a time count the running recordings and
// take a place among them.
const RECORDING_PLACES_LOCK = 7_340_001;
// A recording whose job the recorder never answered for after this long.
const START_LOST_MS = 2 * 60 * 1000;
// A recording the recorder no longer knows, after the broadcast ended this
// long ago (or ran past its longest), is given up.
const UNKNOWN_GIVEN_UP_MS = 60 * 60 * 1000;
const POLL_PAGE = 50;

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Records broadcasts with the environment's own recorder (LiveKit egress):
 * picture and sound of the host and the co-host, upright, to one MP4 file in
 * the recorder's folder. Switched on by LIVE_RECORDING_ENABLED, only where
 * the environment runs its own recorder. Nothing here stops a broadcast: a
 * recording that cannot be made leaves the broadcast as it is.
 */
@Injectable()
export class LiveRecordingService {
  private readonly logger = new Logger(LiveRecordingService.name);
  private egressClient?: EgressClient;
  private roomClient?: RoomServiceClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

  /**
   * Starts recording a broadcast that has just begun, if recording is on and
   * the recorder has a free place; otherwise marks it as not recorded for
   * the limit. Never throws.
   */
  async start(streamId: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      // Counted and taken under one lock: two broadcasts starting at the
      // same moment on two servers cannot both take the last place.
      const placed = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RECORDING_PLACES_LOCK})`;
        const running = await tx.liveStream.count({
          where: { recordingStatus: 'RECORDING' },
        });
        const free = running < RECORDINGS_AT_ONCE;
        await tx.liveStream.update({
          where: { id: streamId },
          data: free
            ? { recordingStatus: 'RECORDING', recordingStartedAt: new Date() }
            : { recordingStatus: 'SKIPPED_LIMIT' },
        });
        return free;
      });
      if (!placed) {
        this.logger.log(`Broadcast ${streamId} not recorded: recorder full`);
        return;
      }
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
      const info = await this.egress().startRoomCompositeEgress(
        streamId,
        {
          file: new EncodedFileOutput({
            fileType: EncodedFileType.MP4,
            filepath: `${RECORDER_FOLDER}/${recordingFileName(streamId)}`,
          }),
        },
        {
          layout: 'grid',
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
      await this.prisma.liveStream.updateMany({
        where: { id: streamId, recordingStatus: 'RECORDING' },
        data: { egressId: info.egressId },
      });
      this.logger.log(`Recording broadcast ${streamId} (${info.egressId})`);
    } catch (error: unknown) {
      this.logger.error(
        `The recording of broadcast ${streamId} could not start: ${errorText(error)}`,
      );
      await this.markFailed(streamId).catch(() => undefined);
    }
  }

  /**
   * Asks the recorder to finish the recording of a broadcast that ended. The
   * recorder closes the file; the check below takes it from there. Never
   * throws: a recording not stopped now is stopped by that check.
   */
  async stop(streamId: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const stream = await this.prisma.liveStream.findUnique({
        where: { id: streamId },
        select: { egressId: true, recordingStatus: true },
      });
      if (stream?.recordingStatus !== 'RECORDING' || !stream.egressId) return;
      await this.egress().stopEgress(stream.egressId);
    } catch (error: unknown) {
      this.logger.warn(
        `The recording of broadcast ${streamId} could not be stopped now: ${errorText(error)}`,
      );
    }
  }

  /**
   * Every minute, asks the recorder about each running recording: stops the
   * one whose broadcast ended or that reached its longest, takes the file of
   * the one that finished, and gives up the one that failed or was lost.
   * Safe on two servers: each change is made only from the state it was
   * read in. Never throws.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async check(now: Date = new Date()): Promise<number> {
    if (!this.isEnabled()) return 0;
    let finished = 0;
    try {
      const running = await this.prisma.liveStream.findMany({
        where: { recordingStatus: 'RECORDING' },
        select: {
          id: true,
          status: true,
          endedAt: true,
          egressId: true,
          recordingStartedAt: true,
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
    } catch (error: unknown) {
      this.logger.error(`Checking the recordings stopped: ${errorText(error)}`);
    }
    return finished;
  }

  private async checkOne(
    stream: {
      id: string;
      status: string;
      endedAt: Date | null;
      egressId: string | null;
      recordingStartedAt: Date | null;
    },
    now: Date,
  ): Promise<boolean> {
    const startedAt = stream.recordingStartedAt?.getTime() ?? 0;
    if (!stream.egressId) {
      // The server that started it stopped before the recorder answered.
      if (now.getTime() - startedAt > START_LOST_MS) {
        await this.markFailed(stream.id, { egressId: null });
      }
      return false;
    }
    const [info] = await this.egress().listEgress({
      egressId: stream.egressId,
    });
    if (!info) {
      const since = stream.endedAt?.getTime() ?? startedAt + RECORDING_MAX_MS;
      if (now.getTime() - since > UNKNOWN_GIVEN_UP_MS) {
        await this.markFailed(stream.id, { egressId: stream.egressId });
      }
      return false;
    }
    switch (info.status) {
      case EgressStatus.EGRESS_STARTING:
      case EgressStatus.EGRESS_ACTIVE:
        if (
          stream.status === 'ENDED' ||
          now.getTime() - startedAt >= RECORDING_MAX_MS
        ) {
          await this.egress().stopEgress(stream.egressId);
        }
        return false;
      case EgressStatus.EGRESS_COMPLETE:
      case EgressStatus.EGRESS_LIMIT_REACHED:
        return this.takeFile(stream.id, stream.egressId, info);
      case EgressStatus.EGRESS_FAILED:
      case EgressStatus.EGRESS_ABORTED:
        this.logger.warn(
          `The recording of broadcast ${stream.id} failed: ${info.error}`,
        );
        await this.markFailed(stream.id, { egressId: stream.egressId });
        return false;
      default:
        // Ending: the recorder is closing the file.
        return false;
    }
  }

  // The file the recorder wrote, if it is the one asked for and holds
  // something; the recording is then made into its replay.
  private async takeFile(
    streamId: string,
    egressId: string,
    info: EgressInfo,
  ): Promise<boolean> {
    const result = info.fileResults[0];
    const file = result ? path.posix.basename(result.filename) : '';
    if (!result || file !== recordingFileName(streamId) || result.size <= 0n) {
      this.logger.warn(
        `The recording of broadcast ${streamId} ended with no usable file`,
      );
      await this.markFailed(streamId, { egressId });
      return false;
    }
    const taken = await this.prisma.liveStream.updateMany({
      where: { id: streamId, egressId, recordingStatus: 'RECORDING' },
      data: {
        recordingStatus: 'PROCESSING',
        recordingFile: file,
        recordingDurationMs: Number(result.duration / 1_000_000n),
        recordingSizeBytes: result.size,
      },
    });
    if (taken.count === 0) return false;
    this.logger.log(`Recording of broadcast ${streamId} finished`);
    return true;
  }

  private markFailed(
    streamId: string,
    where: { egressId?: string | null } = {},
  ) {
    return this.prisma.liveStream.updateMany({
      where: { id: streamId, recordingStatus: 'RECORDING', ...where },
      data: { recordingStatus: 'FAILED' },
    });
  }
}
