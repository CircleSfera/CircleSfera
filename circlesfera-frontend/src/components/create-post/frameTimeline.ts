/** How wide a second of a clip is on the timeline, in px. */
export const TIMELINE_PX_PER_SEC = 24;
/** The narrowest a clip is drawn, so a short one can still be touched. */
export const TIMELINE_MIN_CLIP_PX = 48;
/** The width of one frame of the strip, in px. */
export const TIMELINE_FRAME_PX = 32;
/** How long a clip is held before it can be dragged to another place. */
export const TIMELINE_HOLD_MS = 400;
/** How far a finger may move during the hold before it counts as a scroll. */
export const TIMELINE_HOLD_SLOP_PX = 8;
/** How much a trim handle moves the clip's edge with an arrow key, in ms. */
export const TIMELINE_KEY_STEP_MS = 100;

/** The width a stretch of a clip takes on the timeline, in px. */
export function timelineWidth(ms: number): number {
  return Math.max(TIMELINE_MIN_CLIP_PX, (ms / 1000) * TIMELINE_PX_PER_SEC);
}

/** How many ms a drag of `px` moves a clip's edge. */
export function msForPx(px: number): number {
  return (px / TIMELINE_PX_PER_SEC) * 1000;
}

/**
 * Where a clip dragged to `x` lands: the place of the first clip whose
 * middle is after it, among the clips' middles in order.
 */
export function dropIndex(middles: number[], x: number, from: number): number {
  const others = middles.filter((_, i) => i !== from);
  const before = others.filter((middle) => middle < x).length;
  return before;
}
