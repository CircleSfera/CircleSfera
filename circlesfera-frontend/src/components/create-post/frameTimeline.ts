/** The width of one frame of a clip's strip, in px. */
export const TIMELINE_FRAME_PX = 32;
/** How much a trim handle moves the clip's edge with an arrow key, in ms. */
export const TIMELINE_KEY_STEP_MS = 100;

/** How many ms a drag of `px` moves an edge, on a bar `barPx` wide for `ms`. */
export function msForPx(px: number, barPx: number, ms: number): number {
  return barPx > 0 ? (px / barPx) * ms : 0;
}

/**
 * Where an item dragged to `at` lands: the place of the first item whose
 * middle is after it, among the items' middles in order.
 */
export function dropIndex(middles: number[], at: number, from: number): number {
  return middles.filter((middle, i) => i !== from && middle < at).length;
}
