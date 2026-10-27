import * as path from 'node:path';
import { BadRequestException, Logger } from '@nestjs/common';
import {
  assertMediaDurationInRange,
  type MediaDurationKind,
} from '../constants/media-duration.constants.js';
import { ffprobe } from '../media/ffmpeg-runner.js';

const logger = new Logger('MediaDuration');

/** Resolve local upload paths the same way VideoProcessor does. */
export function resolveMediaInputPath(url: string): string {
  if (url.startsWith('/uploads/')) {
    return path.join(process.cwd(), url);
  }
  return url;
}

export async function probeMediaDurationSec(url: string): Promise<number> {
  const metadata = await ffprobe(resolveMediaInputPath(url));
  // ffprobe writes "N/A" or nothing when it cannot tell the length.
  const reported = metadata.format?.duration;
  const duration =
    typeof reported === 'string' && /^[0-9]+(\.[0-9]+)?$/.test(reported)
      ? Number(reported)
      : Number.NaN;
  if (!Number.isFinite(duration)) {
    throw new Error('ffprobe_no_duration');
  }
  return duration;
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
