import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

/** A co-host's recording, and how long after the host's it began. */
export interface CoHostReplayPart extends ReplayPart {
  offsetMs: number;
}

// One half of the upright screen: the picture filled to 720 x 640, its
// edges cut, at 30 frames a second.
const HALF =
  'scale=720:640:force_original_aspect_ratio=increase,crop=720:640,setsar=1,fps=30';

/**
 * The replay of a broadcast with a co-host, split as it was seen: the host
 * on top, the co-host below, each co-host part placed at the moment it
 * began; black below while no co-host is on. The sound of everyone is
 * mixed at its own level, and the replay lasts as long as the host's
 * recording. Encoded as a host's replay, with the filters on two threads.
 */
export function composeArgs(
  host: ReplayPart,
  coHosts: CoHostReplayPart[],
  outputDir: string,
  playlist: string,
): string[] {
  const graph = [
    `[0:v]setpts=PTS-STARTPTS,${HALF}[top]`,
    'color=c=black:s=720x640:r=30[bg0]',
  ];
  const sounds: string[] = [];
  coHosts.forEach((coHost, index) => {
    const n = index + 1;
    const seconds = (coHost.offsetMs / 1000).toFixed(3);
    graph.push(
      `[${n}:v]setpts=PTS-STARTPTS+${seconds}/TB,${HALF}[co${n}]`,
      `[bg${index}][co${n}]overlay=eof_action=pass:repeatlast=0[bg${n}]`,
    );
    if (coHost.audio) {
      graph.push(
        `[${n}:a]aresample=48000,asetpts=PTS-STARTPTS,adelay=${coHost.offsetMs}:all=1[a${n}]`,
      );
      sounds.push(`[a${n}]`);
    }
  });
  graph.push(
    `[top][bg${coHosts.length}]vstack=inputs=2:shortest=1,format=yuv420p[v]`,
  );
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
    ...coHosts.flatMap((coHost) => ['-i', coHost.file]),
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

/**
 * Makes the replay of a recorded broadcast: its picture and its stream in a
 * folder of the uploads, as any video's, recorded as the host's own; with
 * the co-hosts' recordings composed below the host's. The recorder's files
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
          select: { role: true, file: true, startedAt: true },
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
    const coHosts = this.coHostParts(stream);

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
          if (coHosts.length === 0) {
            await runFfmpeg(replayArgs(input, outputDir, playlist), {
              signal,
            });
            return;
          }
          const parts: CoHostReplayPart[] = [];
          for (const coHost of coHosts) {
            const data = await ffprobe(coHost.file, { signal });
            parts.push({ ...coHost, audio: hasAudio(data) });
          }
          await runFfmpeg(
            composeArgs(
              { file: input, audio: hasAudio(host) },
              parts,
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

    for (const file of [input, ...coHosts.map((coHost) => coHost.file)]) {
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
   * The co-hosts' recordings of a broadcast, in the recorder's folder, each
   * with how long after the host's it began. Only files named as the
   * recorder was asked to write them; one missing is left out.
   */
  private coHostParts(stream: {
    id: string;
    recordingFile: string | null;
    recordingParts: { role: string; file: string; startedAt: Date }[];
  }): { file: string; offsetMs: number }[] {
    const host = stream.recordingParts.find(
      (part) => part.role === 'HOST' && part.file === stream.recordingFile,
    );
    if (!host) return [];
    const prefix = `live-${stream.id}-cohost-`;
    const coHosts: { file: string; offsetMs: number }[] = [];
    for (const part of stream.recordingParts) {
      if (
        part.role !== 'COHOST' ||
        !part.file.startsWith(prefix) ||
        !/^\d+\.mp4$/.test(part.file.slice(prefix.length))
      ) {
        continue;
      }
      const file = path.join(recordingsFolder(), part.file);
      if (!fs.existsSync(file)) {
        this.logger.warn(
          `The co-host recording ${part.file} is not in the recorder's folder: left out`,
        );
        continue;
      }
      coHosts.push({
        file,
        offsetMs: Math.max(
          0,
          part.startedAt.getTime() - host.startedAt.getTime(),
        ),
      });
    }
    return coHosts;
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
