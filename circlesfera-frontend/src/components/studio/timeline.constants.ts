/**
 * Where time zero sits from the left edge of the timeline.
 *
 * The controls of each track stay pinned at the left edge; this is the room
 * they need, so they never cover the start of a clip. On phones the controls
 * fold into one button; from `md` up the five of them are shown.
 *
 * The value lives in CSS, as `--timeline-offset` on the timeline, so layout
 * and pointer maths read the same number at every width.
 */
export const TIMELINE_OFFSET_CLASS =
  '[--timeline-offset:64px] md:[--timeline-offset:256px]';

const FALLBACK_OFFSET_PX = 64;

/** The offset in px, as the timeline has it right now. */
export function timelineOffsetPx(timeline: HTMLElement | null): number {
  if (!timeline) return FALLBACK_OFFSET_PX;
  const value = Number.parseFloat(
    getComputedStyle(timeline).getPropertyValue('--timeline-offset'),
  );
  return Number.isFinite(value) ? value : FALLBACK_OFFSET_PX;
}
