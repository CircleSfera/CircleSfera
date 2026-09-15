import {
  FRAME_MAX_DURATION_SEC,
  FRAME_MIN_DURATION_SEC,
} from '../constants/uploadLimits';

export const FRAME_DURATION_PRESETS = [
  FRAME_MIN_DURATION_SEC,
  30,
  60,
  FRAME_MAX_DURATION_SEC,
] as const;

export type FrameDurationPreset = (typeof FRAME_DURATION_PRESETS)[number];

export interface FrameClipWindow {
  startTime: number;
  endTime: number;
}

/** Max clip length allowed for a given source duration. */
export function maxFrameClipLength(sourceSec: number): number {
  if (!Number.isFinite(sourceSec) || sourceSec <= 0) return 0;
  return Math.min(FRAME_MAX_DURATION_SEC, sourceSec);
}

/** Presets that fit within the source (chip enabled when source >= preset). */
export function availableFramePresets(
  sourceSec: number,
): FrameDurationPreset[] {
  const maxLen = maxFrameClipLength(sourceSec);
  return FRAME_DURATION_PRESETS.filter((p) => p <= maxLen);
}

/**
 * Default window: from t=0 for min(source, 90) seconds.
 * Caller must ensure sourceSec >= FRAME_MIN_DURATION_SEC.
 */
export function defaultFrameWindow(sourceSec: number): FrameClipWindow {
  return { startTime: 0, endTime: maxFrameClipLength(sourceSec) };
}

/**
 * Clamp a start + desired length into a valid Frame window.
 * Length is forced into [15, min(90, source)].
 */
export function clampFrameWindow(
  sourceSec: number,
  start: number,
  length: number,
): FrameClipWindow {
  const maxLen = maxFrameClipLength(sourceSec);
  if (maxLen < FRAME_MIN_DURATION_SEC) {
    return { startTime: 0, endTime: Math.max(0, sourceSec) };
  }

  const clippedLength = Math.min(
    maxLen,
    Math.max(FRAME_MIN_DURATION_SEC, length),
  );
  const maxStart = Math.max(0, sourceSec - clippedLength);
  const startTime = Math.min(Math.max(0, start), maxStart);
  return {
    startTime,
    endTime: startTime + clippedLength,
  };
}

export function frameClipLength(window: FrameClipWindow): number {
  return Math.max(0, window.endTime - window.startTime);
}

export function isFrameClipInRange(window: FrameClipWindow): boolean {
  const len = frameClipLength(window);
  return (
    Number.isFinite(len) &&
    len >= FRAME_MIN_DURATION_SEC - 0.05 &&
    len <= FRAME_MAX_DURATION_SEC + 0.05
  );
}
