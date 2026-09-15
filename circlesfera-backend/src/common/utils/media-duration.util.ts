import * as path from 'node:path';
import { BadRequestException, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import {
  assertMediaDurationInRange,
  type MediaDurationKind,
} from '../constants/media-duration.constants.js';

const logger = new Logger('MediaDuration');

/** Resolve local upload paths the same way VideoProcessor does. */
export function resolveMediaInputPath(url: string): string {
  if (url.startsWith('/uploads/')) {
    return path.join(process.cwd(), url);
  }
  return url;
}

export function probeMediaDurationSec(url: string): Promise<number> {
  const input = resolveMediaInputPath(url);
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const duration = metadata?.format?.duration;
      if (typeof duration !== 'number' || !Number.isFinite(duration)) {
        reject(new Error('ffprobe_no_duration'));
        return;
      }
      resolve(duration);
    });
  });
}

export async function assertVideoUrlDuration(
  kind: MediaDurationKind,
  url: string,
): Promise<void> {
  let durationSec: number;
  try {
    durationSec = await probeMediaDurationSec(url);
  } catch (err) {
    logger.warn(
      `Could not probe duration for ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw new BadRequestException('MEDIA_DURATION_PROBE_FAILED');
  }

  const result = assertMediaDurationInRange(kind, durationSec);
  if (!result.ok) {
    throw new BadRequestException(result.code);
  }
}
