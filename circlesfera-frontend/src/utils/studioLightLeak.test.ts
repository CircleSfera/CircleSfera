import { describe, expect, it } from 'vitest';
import {
  effectFilter,
  LEAK_COLOR,
  lightLeakGeq,
  lightLeakPixel,
  PRO_EFFECTS,
} from './studioEffects';

const W = 160;
const H = 90;

describe('the light leak effect', () => {
  it('leaves the picture as it is at no intensity', () => {
    expect(lightLeakPixel([10, 20, 30], 40, 30, W, H, 0.5, 1, 0)).toEqual([
      10, 20, 30,
    ]);
  });

  it('crosses from left to right over its time, warmest at its centre', () => {
    const y = H * 0.35;
    // Halfway through, the centre is at half the width.
    const centre = lightLeakPixel([0, 0, 0], W / 2, y, W, H, 0.5, 1, 1);
    expect(centre).toEqual([...LEAK_COLOR]);
    // At the start the left edge is lit and the right one is not.
    const left = lightLeakPixel([0, 0, 0], 0, y, W, H, 0, 1, 1);
    const right = lightLeakPixel([0, 0, 0], W - 1, y, W, H, 0, 1, 1);
    expect(left[0]).toBeGreaterThan(right[0]);
    // At the end it is the other way round.
    const lateLeft = lightLeakPixel([0, 0, 0], 0, y, W, H, 1, 1, 1);
    const lateRight = lightLeakPixel([0, 0, 0], W - 1, y, W, H, 1, 1, 1);
    expect(lateRight[0]).toBeGreaterThan(lateLeft[0]);
  });

  it('only lightens, as a screen does, and keeps white white', () => {
    const lit = lightLeakPixel([100, 100, 100], 50, 30, W, H, 0.3, 1, 1);
    for (const c of lit) expect(c).toBeGreaterThanOrEqual(100);
    expect(lightLeakPixel([255, 255, 255], 50, 30, W, H, 0.3, 1, 1)).toEqual([
      255, 255, 255,
    ]);
  });

  it('exports geq expressions in RGB timed from the effect start', () => {
    const filter = lightLeakGeq(3, 0.6);
    expect(filter.startsWith('format=gbrp,geq=r=')).toBe(true);
    expect(filter).toContain('clip(T/3\\,0\\,1)');
    // The reach divides as a whole.
    expect(filter).toContain('/(0.75*max(W\\,H))');
    expect(
      effectFilter(
        { effect: 'lightleak', intensity: 60, duration: 3 } as never,
        1080,
        1920,
        'e0',
      ),
    ).toBe(filter);
    expect(PRO_EFFECTS.has('lightleak')).toBe(true);
  });
});
