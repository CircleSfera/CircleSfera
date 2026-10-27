import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import {
  ffprobe,
  momentAtPercent,
  runFfmpeg,
  screenshotArgs,
  withTimeout,
} from '../../common/media/ffmpeg-runner.js';
import {
  recordingFileName,
  recordingsFolder,
} from '../../live/recording/live-recording.constants.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StoredFilesService } from '../services/stored-files.service.js';

/** The shortest time a replay is given to be made. */
const REPLAY_MIN_MS = 10 * 60 * 1000;

/**
 * The replay of a broadcast, kept small: one 720p rendition, quality-based
 * (CRF 26) as a talking head moves little, with a ceiling for the moments
 * that move more; preset medium, as the server's processors are shared;
 * two threads, so one replay never takes the whole server; 4-second pieces
 * on 2-second key frames. Post videos keep their own settings.
 */
export function replayArgs(
  input: string,
  outputDir: string,
  playlist: string,
): string[] {
  return [
    '-i',
    input,
    '-y',
    '-vf',
    'scale=w=720:h=1280:force_original_aspect_ratio=decrease:force_divisible_by=2',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-profile:v',
    'main',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '26',
    '-maxrate',
    '1200k',
    '-bufsize',
    '2400k',
    '-g',
    '60',
    '-keyint_min',
    '60',
    '-sc_threshold',
    '0',
    '-threads',
    '2',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-ar',
    '48000',
    '-f',
    'hls',
    '-hls_time',
    '4',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    path.join(outputDir, '720p_%03d.ts'),
    playlist,
  ];
}

/**
 * Makes the replay of a recorded broadcast: its picture and its stream in a
 * folder of the uploads, as any video's, recorded as the host's own. The
 * recorder's file is deleted once the replay is saved; a replay that cannot
 * be made keeps it, for another try, until the nightly clean-up.
 */
@Injectable()
export class LiveReplayMaker {
  private readonly logger = new Logger(LiveReplayMaker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storedFiles: StoredFilesService,
  ) {}

  async make(streamId: string | undefined): Promise<void> {
    if (!streamId) {
      throw new UnrecoverableError('Missing broadcast for its replay');
    }
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      select: {
        id: true,
        hostId: true,
        recordingStatus: true,
        recordingFile: true,
        recordingDurationMs: true,
      },
    });
    // Deleted meanwhile, or already made: nothing to do.
    if (stream?.recordingStatus !== 'PROCESSING' || !stream.recordingFile) {
      return;
    }
    // Only the file the recorder was asked to write for this broadcast.
    if (stream.recordingFile !== recordingFileName(stream.id)) {
      throw new UnrecoverableError(
        `The recording of broadcast ${stream.id} is not its own file`,
      );
    }
    const input = path.join(recordingsFolder(), stream.recordingFile);
    if (!fs.existsSync(input)) {
      throw new UnrecoverableError(
        `The recording of broadcast ${stream.id} is not in the recorder's folder`,
      );
    }

    // A folder named as a video's stream folder, so that media access and
    // the deletion of the replay treat it as one.
    const baseName = randomUUID();
    const outputDir = path.join(process.cwd(), 'uploads', baseName);
    await fs.promises.mkdir(outputDir, { recursive: true });
    let keepOutput = false;
    try {
      // Up to twice the recording's length: the replay is encoded again.
      const limitMs = Math.max(
        REPLAY_MIN_MS,
        2 * (stream.recordingDurationMs ?? 0),
      );
      await withTimeout(
        limitMs,
        `The replay of broadcast ${stream.id} timed out`,
        async (signal) => {
          const atSec = momentAtPercent(await ffprobe(input, { signal }), 10);
          await runFfmpeg(
            screenshotArgs(
              input,
              atSec,
              540,
              path.join(outputDir, 'thumb.jpg'),
            ),
            { signal },
          );
          await runFfmpeg(
            replayArgs(input, outputDir, path.join(outputDir, 'master.m3u8')),
            { signal },
          );
        },
      );

      // Kept on this server, as the recorder's file was.
      const replayUrl = `/uploads/${baseName}/master.m3u8`;
      const thumbnailUrl = `/uploads/${baseName}/thumb.jpg`;

      // Saved only if the recording still waits for this very file. The
      // folder is recorded under the name of the video it stands for, as
      // every stream folder is checked by it.
      const written = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.liveStream.updateMany({
          where: {
            id: stream.id,
            recordingStatus: 'PROCESSING',
            recordingFile: stream.recordingFile,
          },
          data: {
            recordingStatus: 'READY',
            replayUrl,
            thumbnailUrl,
            recordingFile: null,
          },
        });
        if (changed.count > 0) {
          await this.storedFiles.record(
            [`/uploads/${baseName}.mp4`],
            { profileId: stream.hostId },
            tx,
          );
        }
        return changed.count;
      });
      keepOutput = written > 0;
      if (!keepOutput) return;
    } finally {
      if (!keepOutput) {
        await fs.promises
          .rm(outputDir, { recursive: true, force: true })
          .catch(() => undefined);
      }
    }

    await fs.promises
      .rm(input, { force: true })
      .catch((error: unknown) =>
        this.logger.warn(
          `The recorder's file of broadcast ${stream.id} is left for the nightly clean-up: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    this.logger.log(`Replay made for broadcast ${stream.id}`);
  }

  /** A replay that could not be made after every try. */
  async markFailed(streamId: string | undefined): Promise<void> {
    if (!streamId) return;
    await this.prisma.liveStream.updateMany({
      where: { id: streamId, recordingStatus: 'PROCESSING' },
      data: { recordingStatus: 'FAILED' },
    });
  }
}
