import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LIVE_GUESTS_MAX } from '@circlesfera/shared';
import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import {
  type FfprobeData,
  ffprobe,
  momentAtPercent,
  runFfmpeg,
  screenshotArgs,
  withTimeout,
} from '../../common/media/ffmpeg-runner.js';
import {
  hostFileName,
  isGuestFileName,
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
function encodeArgs(outputDir: string, playlist: string): string[] {
  return [
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

/** The replay of a broadcast the host made alone: their picture, upright. */
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
    ...encodeArgs(outputDir, playlist),
  ];
}

/** One person's recording, and whether it holds sound. */
export interface ReplayPart {
  file: string;
  audio: boolean;
}

/**
 * A guest's recording: how long after the host's it began, and the column
 * of the lower half it is shown in, counted from 0.
 */
export interface GuestReplayPart extends ReplayPart {
  offsetMs: number;
  column: number;
}

/** A guest's recording before it is given a column. */
export interface GuestPartTiming {
  offsetMs: number;
  // Unknown: it is taken to last to the end of the replay.
  durationMs: number | null;
  // The guest recorded; empty for a part recorded before guests were named.
  profileId: string | null;
}

/**
 * Gives each guest part a column of the lower half, at most `columnsMax`:
 * a guest keeps the column they had when it is free again, and otherwise
 * takes the first column free when they begin. As no more guests are on air
 * at once than there are columns, every part finds one; a part that does
 * not (its times overlapping beyond them) is left out, as null.
 */
export function placeInColumns(
  parts: GuestPartTiming[],
  columnsMax: number = LIVE_GUESTS_MAX,
): (number | null)[] {
  const freeFrom: number[] = [];
  const lastColumn = new Map<string, number>();
  const placed: (number | null)[] = parts.map(() => null);
  const order = parts
    .map((part, index) => ({ part, index }))
    .sort((a, b) => a.part.offsetMs - b.part.offsetMs || a.index - b.index);
  for (const { part, index } of order) {
    const free = (column: number): boolean =>
      (freeFrom[column] ?? Number.NEGATIVE_INFINITY) <= part.offsetMs;
    const guest = part.profileId ?? '';
    const kept = lastColumn.get(guest);
    let column: number | null = kept !== undefined && free(kept) ? kept : null;
    for (let c = 0; column === null && c < columnsMax; c++) {
      if (free(c)) column = c;
    }
    if (column === null) continue;
    freeFrom[column] =
      part.durationMs === null
        ? Number.POSITIVE_INFINITY
        : part.offsetMs + part.durationMs;
    lastColumn.set(guest, column);
    placed[index] = column;
  }
  return placed;
}

const FULL_WIDTH = 720;
const HALF_HEIGHT = 640;

// One tile of the upright screen: the picture filled to the width given and
// half the height, its edges cut, at 30 frames a second.
const tile = (width: number): string =>
  `scale=${width}:${HALF_HEIGHT}:force_original_aspect_ratio=increase,crop=${width}:${HALF_HEIGHT},setsar=1,fps=30`;

/**
 * The replay of a broadcast with guests, split as it was seen: the host on
 * the upper half, the guests side by side on the lower half, each in their
 * own column, each part placed at the moment it began; black in a column
 * while nobody is on in it. The columns used share the width. The sound of
 * everyone is mixed at its own level, and the replay lasts as long as the
 * host's recording. Encoded as a host's replay, with the filters on two
 * threads.
 */
export function composeArgs(
  host: ReplayPart,
  guests: GuestReplayPart[],
  outputDir: string,
  playlist: string,
): string[] {
  const columns = Math.max(1, ...guests.map((guest) => guest.column + 1));
  // Even, as the encoder needs.
  const width = Math.floor(FULL_WIDTH / columns / 2) * 2;
  const graph = [`[0:v]setpts=PTS-STARTPTS,${tile(FULL_WIDTH)}[top]`];
  const layers: number[] = [];
  for (let c = 0; c < columns; c++) {
    graph.push(`color=c=black:s=${width}x${HALF_HEIGHT}:r=30[col${c}_0]`);
    layers.push(0);
  }
  const sounds: string[] = [];
  guests.forEach((guest, index) => {
    const n = index + 1;
    const seconds = (guest.offsetMs / 1000).toFixed(3);
    const below = layers[guest.column];
    layers[guest.column] = below + 1;
    graph.push(
      `[${n}:v]setpts=PTS-STARTPTS+${seconds}/TB,${tile(width)}[g${n}]`,
      `[col${guest.column}_${below}][g${n}]overlay=eof_action=pass:repeatlast=0[col${guest.column}_${below + 1}]`,
    );
    if (guest.audio) {
      graph.push(
        `[${n}:a]aresample=48000,asetpts=PTS-STARTPTS,adelay=${guest.offsetMs}:all=1[a${n}]`,
      );
      sounds.push(`[a${n}]`);
    }
  });
  const bottoms = layers.map((layer, c) => `[col${c}_${layer}]`);
  if (columns === 1) {
    graph.push(
      `[top]${bottoms[0]}vstack=inputs=2:shortest=1,format=yuv420p[v]`,
    );
  } else {
    graph.push(
      `${bottoms.join('')}hstack=inputs=${columns}[bottom]`,
      '[top][bottom]vstack=inputs=2:shortest=1,format=yuv420p[v]',
    );
  }
  const audio = host.audio || sounds.length > 0;
  if (audio) {
    // The host's sound first, or silence in its place: the mix lasts as
    // long as it, and the picture's end cuts the silence.
    graph.push(
      host.audio
        ? '[0:a]aresample=48000,asetpts=PTS-STARTPTS[a0]'
        : 'anullsrc=r=48000:cl=stereo[a0]',
      `[a0]${sounds.join('')}amix=inputs=${sounds.length + 1}:duration=first:normalize=0[a]`,
    );
  }
  return [
    '-i',
    host.file,
    ...guests.flatMap((guest) => ['-i', guest.file]),
    '-y',
    '-filter_complex_threads',
    '2',
    '-filter_complex',
    graph.join(';'),
    '-map',
    '[v]',
    ...(audio ? ['-map', '[a]'] : []),
    '-shortest',
    ...encodeArgs(outputDir, playlist),
  ];
}

const hasAudio = (data: FfprobeData): boolean =>
  (data.streams ?? []).some((stream) => stream.codec_type === 'audio');

// How long a file lasts, as read from it; null when it does not say.
const probedMs = (data: FfprobeData): number | null => {
  const seconds = Number(data.format?.duration);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
};

/** A guest's recording found in the recorder's folder. */
interface FoundGuestPart {
  file: string;
  offsetMs: number;
  durationMs: number | null;
  profileId: string | null;
}

/**
 * Makes the replay of a recorded broadcast: its picture and its stream in a
 * folder of the uploads, as any video's, recorded as the host's own; with
 * the guests' recordings composed below the host's. The recorder's files
 * are deleted once the replay is saved; a replay that cannot be made keeps
 * them, for another try, until the nightly clean-up.
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
        recordingParts: {
          where: { status: 'DONE' },
          select: {
            role: true,
            file: true,
            startedAt: true,
            durationMs: true,
            profileId: true,
          },
          orderBy: { startedAt: 'asc' },
        },
      },
    });
    // Deleted meanwhile, or already made: nothing to do.
    if (stream?.recordingStatus !== 'PROCESSING' || !stream.recordingFile) {
      return;
    }
    // Only the file the recorder was asked to write for this broadcast.
    if (stream.recordingFile !== hostFileName(stream.id)) {
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
    const guests = this.guestParts(stream);

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
          const host = await ffprobe(input, { signal });
          const atSec = momentAtPercent(host, 10);
          await runFfmpeg(
            screenshotArgs(
              input,
              atSec,
              540,
              path.join(outputDir, 'thumb.jpg'),
            ),
            { signal },
          );
          const playlist = path.join(outputDir, 'master.m3u8');
          if (guests.length === 0) {
            await runFfmpeg(replayArgs(input, outputDir, playlist), {
              signal,
            });
            return;
          }
          await runFfmpeg(
            composeArgs(
              { file: input, audio: hasAudio(host) },
              await this.placeGuests(guests, signal),
              outputDir,
              playlist,
            ),
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

    for (const file of [input, ...guests.map((guest) => guest.file)]) {
      await fs.promises
        .rm(file, { force: true })
        .catch((error: unknown) =>
          this.logger.warn(
            `The recorder's file ${path.basename(file)} is left for the nightly clean-up: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    }
    this.logger.log(`Replay made for broadcast ${stream.id}`);
  }

  /**
   * Reads each guest's recording for its sound and, when the recorder did
   * not say, its length, and gives it its column. A part that finds no
   * column is left out of the replay.
   */
  private async placeGuests(
    guests: FoundGuestPart[],
    signal: AbortSignal,
  ): Promise<GuestReplayPart[]> {
    const probed: { audio: boolean; durationMs: number | null }[] = [];
    for (const guest of guests) {
      const data = await ffprobe(guest.file, { signal });
      probed.push({
        audio: hasAudio(data),
        durationMs: guest.durationMs ?? probedMs(data),
      });
    }
    const columns = placeInColumns(
      guests.map((guest, index) => ({
        offsetMs: guest.offsetMs,
        durationMs: probed[index].durationMs,
        profileId: guest.profileId,
      })),
    );
    const parts: GuestReplayPart[] = [];
    guests.forEach((guest, index) => {
      const column = columns[index];
      if (column === null) {
        this.logger.warn(
          `The guest recording ${path.basename(guest.file)} overlaps more guests than the replay shows: left out`,
        );
        return;
      }
      parts.push({
        file: guest.file,
        offsetMs: guest.offsetMs,
        audio: probed[index].audio,
        column,
      });
    });
    return parts;
  }

  /**
   * The guests' recordings of a broadcast, in the recorder's folder, each
   * with how long after the host's it began, how long it lasts if the
   * recorder said, and the guest it records. Only files named as the
   * recorder was asked to write them; one missing is left out.
   */
  private guestParts(stream: {
    id: string;
    recordingFile: string | null;
    recordingParts: {
      role: string;
      file: string;
      startedAt: Date;
      durationMs: number | null;
      profileId: string | null;
    }[];
  }): FoundGuestPart[] {
    const host = stream.recordingParts.find(
      (part) => part.role === 'HOST' && part.file === stream.recordingFile,
    );
    if (!host) return [];
    const guests: FoundGuestPart[] = [];
    for (const part of stream.recordingParts) {
      if (part.role !== 'COHOST' || !isGuestFileName(stream.id, part.file)) {
        continue;
      }
      const file = path.join(recordingsFolder(), part.file);
      if (!fs.existsSync(file)) {
        this.logger.warn(
          `The guest recording ${part.file} is not in the recorder's folder: left out`,
        );
        continue;
      }
      guests.push({
        file,
        offsetMs: Math.max(
          0,
          part.startedAt.getTime() - host.startedAt.getTime(),
        ),
        durationMs: part.durationMs,
        profileId: part.profileId,
      });
    }
    return guests;
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
