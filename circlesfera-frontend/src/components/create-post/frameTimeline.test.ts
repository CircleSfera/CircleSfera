import { describe, expect, it } from 'vitest';
import {
  dropIndex,
  msForPx,
  TIMELINE_MIN_CLIP_PX,
  TIMELINE_PX_PER_SEC,
  timelineWidth,
} from './frameTimeline';

describe('the clips timeline', () => {
  it('draws a clip as wide as it lasts, never narrower than a finger', () => {
    expect(timelineWidth(10_000)).toBe(10 * TIMELINE_PX_PER_SEC);
    expect(timelineWidth(100)).toBe(TIMELINE_MIN_CLIP_PX);
  });

  it('turns a drag into time', () => {
    expect(msForPx(TIMELINE_PX_PER_SEC * 2)).toBe(2000);
  });

  it('drops a dragged clip before the first clip whose middle is after it', () => {
    const middles = [50, 150, 250];
    expect(dropIndex(middles, 10, 2)).toBe(0);
    expect(dropIndex(middles, 200, 0)).toBe(1);
    expect(dropIndex(middles, 400, 0)).toBe(2);
  });
});
