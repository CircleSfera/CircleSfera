/** Authoritative media duration windows (seconds). Keep FE uploadLimits in sync. */

export const FRAME_MIN_DURATION_SEC = 15;
export const FRAME_MAX_DURATION_SEC = 90;

/** Aligns with create copy “Up to 60s”. */
export const STORY_MAX_DURATION_SEC = 60;

/** Soft ceiling for feed Post videos (not short-form Frames). */
export const POST_MAX_DURATION_SEC = 300;

export type MediaDurationKind = 'FRAME' | 'STORY' | 'POST';

export function assertMediaDurationInRange(
  kind: MediaDurationKind,
  durationSec: number,
): { ok: true } | { ok: false; code: string; min?: number; max: number } {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { ok: false, code: 'MEDIA_DURATION_UNKNOWN', max: 0 };
  }

  if (kind === 'FRAME') {
    if (
      durationSec < FRAME_MIN_DURATION_SEC ||
      durationSec > FRAME_MAX_DURATION_SEC
    ) {
      return {
        ok: false,
        code: 'FRAME_DURATION_OUT_OF_RANGE',
        min: FRAME_MIN_DURATION_SEC,
        max: FRAME_MAX_DURATION_SEC,
      };
    }
    return { ok: true };
  }

  if (kind === 'STORY' && durationSec > STORY_MAX_DURATION_SEC) {
    return {
      ok: false,
      code: 'STORY_DURATION_TOO_LONG',
      max: STORY_MAX_DURATION_SEC,
    };
  }

  if (kind === 'POST' && durationSec > POST_MAX_DURATION_SEC) {
    return {
      ok: false,
      code: 'POST_DURATION_TOO_LONG',
      max: POST_MAX_DURATION_SEC,
    };
  }

  return { ok: true };
}
