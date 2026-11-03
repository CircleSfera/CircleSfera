import { describe, expect, it } from 'vitest';
import { dropIndex, msForPx } from './frameTimeline';

describe('the clip trim helpers', () => {
  it('turns a drag on the bar into time, in the clip’s length', () => {
    expect(msForPx(50, 200, 8000)).toBe(2000);
    expect(msForPx(50, 0, 8000)).toBe(0);
  });

  it('drops a dragged item before the first item whose middle is after it', () => {
    const middles = [50, 150, 250];
    expect(dropIndex(middles, 10, 2)).toBe(0);
    expect(dropIndex(middles, 200, 0)).toBe(1);
    expect(dropIndex(middles, 400, 0)).toBe(2);
  });
});
