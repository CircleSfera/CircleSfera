import { BadRequestException } from '@nestjs/common';

/**
 * Validate optional audio clip start against catalog track duration (seconds).
 * Returns the normalized start ms to persist (0 when no audio).
 */
export function resolveAudioStartMs(params: {
  audioId?: string | null;
  audioStartMs?: number | null;
  trackDurationSec: number;
}): number {
  if (!params.audioId) {
    return 0;
  }

  const startMs = params.audioStartMs ?? 0;
  if (!Number.isInteger(startMs) || startMs < 0) {
    throw new BadRequestException('AUDIO_START_INVALID');
  }

  const trackMs = Math.max(0, Math.floor(params.trackDurationSec * 1000));
  if (trackMs <= 0) {
    throw new BadRequestException('AUDIO_DURATION_UNKNOWN');
  }

  // Start must be strictly inside the track so at least 1ms can play.
  if (startMs >= trackMs) {
    throw new BadRequestException('AUDIO_START_OUT_OF_RANGE');
  }

  return startMs;
}
