import * as path from 'node:path';
import { BadRequestException, Logger } from '@nestjs/common';
import {
  assertMediaDurationInRange,
  type MediaDurationKind,
} from '../constants/media-duration.constants.js';
import { ffprobe, withTimeout } from '../media/ffmpeg-runner.js';

const logger = new Logger('MediaDuration');

// A person waits for this while their post or story is created: a file or
// address that ffprobe cannot read in this time is refused, and ffprobe is
// stopped, instead of holding the request open.
export const PROBE_TIME_LIMIT_MS = 30_000;

/** Resolve local upload paths the same way VideoProcessor does. */
export function resolveMediaInputPath(url: string): string {
  if (url.startsWith('/uploads/')) {
    return path.join(process.cwd(), url);
  }
  return url;
}

export async function probeMediaDurationSec(url: string): Promise<number> {
  const metadata = await withTimeout(
    PROBE_TIME_LIMIT_MS,
    'ffprobe_timeout',
    (signal) => ffprobe(resolveMediaInputPath(url), { signal }),
  );
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
