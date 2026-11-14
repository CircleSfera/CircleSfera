import { describe, expect, it } from 'vitest';
import {
  effectFilter,
  PRO_EFFECTS,
  vhsGeq,
  vhsPixel,
  vhsShift,
} from './studioEffects';

const W = 200;
const H = 100;
// A picture whose red rises across and whose blue falls across.
const picture = (x: number, _y: number) => [x, 128, 255 - x] as const;

describe('the VHS effect', () => {
  it('leaves the picture as it is at no intensity', () => {
    expect(vhsPixel(picture, 50, 1, W, H, 0.7, 0)).toEqual([50, 128, 205]);
  });

  it('moves red and blue apart sideways, clamped at the edges', () => {
    const shift = vhsShift(W, 1);
    expect(shift).toBe(1);
    const [r, g, b] = vhsPixel(picture, 50, 0, W, H, 1.9, 1);
    expect([r, g, b]).toEqual([50 - shift, 128, 255 - (50 + shift)]);
    expect(vhsPixel(picture, 0, 0, W, H, 1.9, 1)[0]).toBe(0);
  });

  it('darkens every other line, and lights a band that runs down every two seconds', () => {
    const even = vhsPixel(picture, 50, 60, W, H, 1.9, 1);
    const odd = vhsPixel(picture, 50, 61, W, H, 1.9, 1);
    expect(odd[1]).toBeLessThan(even[1]);
    // At 0.5 s the band is a quarter of the way down.
    const inBand = vhsPixel(picture, 50, 24, W, H, 0.5, 1);
    const outside = vhsPixel(picture, 50, 80, W, H, 0.5, 1);
    expect(inBand[1]).toBe(128 + 40);
    expect(outside[1]).toBe(128);
  });

  it('exports geq expressions in RGB with the same shift, lines and band', () => {
    const filter = vhsGeq(1080, 0.5);
    expect(filter).toContain('r(clip(X-3\\,0\\,W-1)\\,Y)');
    expect(filter).toContain('b(clip(X+3\\,0\\,W-1)\\,Y)');
    expect(filter).toContain('mod(Y\\,2)');
    expect(
      effectFilter({ effect: 'vhs', intensity: 50 } as never, 1080, 1920, 'e0'),
    ).toBe(filter);
    expect(PRO_EFFECTS.has('vhs')).toBe(true);
  });
});
