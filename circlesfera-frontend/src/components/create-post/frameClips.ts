import {
  FRAME_MAX_DURATION_SEC,
  FRAME_MIN_DURATION_SEC,
} from '../../constants/uploadLimits';

/** A clip of a Frame as it goes to the server: its file and its window. */
export interface FrameClip {
  file: File;
  /** How long the recorded clip is, in ms. */
  ms: number;
  startMs: number;
  endMs: number;
}

/** The shortest piece a clip may be trimmed to, in ms. */
export const CLIP_MIN_MS = 500;

/** A clip as it was recorded, whole. */
export function wholeClip(clip: { file: File; ms: number }): FrameClip {
  return { file: clip.file, ms: clip.ms, startMs: 0, endMs: clip.ms };
}

/** How long the clips last together, in ms. */
export function clipsLength(clips: FrameClip[]): number {
  return clips.reduce((sum, clip) => sum + (clip.endMs - clip.startMs), 0);
}

/** Whether the clips together make a Frame: not too short, nor too long. */
export function clipsMakeAFrame(clips: FrameClip[]): boolean {
  const ms = clipsLength(clips);
  return (
    clips.length > 0 &&
    ms >= FRAME_MIN_DURATION_SEC * 1000 &&
    ms <= FRAME_MAX_DURATION_SEC * 1000
  );
}

/**
 * A new window for a clip: the start before the end by at least the shortest
 * piece, both inside the clip.
 */
export function trimClip(
  clip: FrameClip,
  next: { startMs?: number; endMs?: number },
): FrameClip {
  const endMs = Math.min(
    clip.ms,
    Math.max(CLIP_MIN_MS, next.endMs ?? clip.endMs),
  );
  const startMs = Math.max(
    0,
    Math.min(next.startMs ?? clip.startMs, endMs - CLIP_MIN_MS),
  );
  return { ...clip, startMs, endMs: Math.max(endMs, startMs + CLIP_MIN_MS) };
}

/** The clips with one moved a place earlier (-1) or later (+1). */
export function moveClip(
  clips: FrameClip[],
  index: number,
  by: -1 | 1,
): FrameClip[] {
  const to = index + by;
  if (to < 0 || to >= clips.length) return clips;
  const next = [...clips];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
