import { describe, expect, it } from 'vitest';
import {
  DUOTONE_LIGHT,
  DUOTONE_SHADOW,
  duotoneGeq,
  duotonePixel,
  effectAmounts,
  effectFilter,
  PRO_EFFECTS,
} from './studioEffects';

describe('the duotone effect', () => {
  it('paints black with the shadow colour and white with the light one at full intensity', () => {
    expect(duotonePixel(0, 0, 0, 1)).toEqual([...DUOTONE_SHADOW]);
    expect(duotonePixel(255, 255, 255, 1)).toEqual([...DUOTONE_LIGHT]);
  });

  it('mixes with the picture by the intensity, and leaves it as it is at 0', () => {
    expect(duotonePixel(10, 200, 90, 0)).toEqual([10, 200, 90]);
    const half = duotonePixel(0, 0, 0, 0.5);
    expect(half).toEqual(DUOTONE_SHADOW.map((c) => Math.round(c / 2)));
  });

  it('exports the same sum per pixel as geq expressions in RGB', () => {
    const filter = duotoneGeq(0.37);
    expect(filter.startsWith('format=gbrp,geq=r=')).toBe(true);
    expect(filter).toContain(':g=');
    expect(filter).toContain(':b=');
    // Commas inside the quoted expressions are escaped for the graph.
    expect(filter).toContain('r(X\\,Y)');
    const clip = { effect: 'duotone', intensity: 37 } as never;
    expect(effectAmounts('duotone', 37, 1080)).toEqual({ amount: 0.37 });
    expect(effectFilter(clip, 1080, 1920, 'e0')).toBe(filter);
  });

  it('comes with Edits Studio Pro', () => {
    expect(PRO_EFFECTS.has('duotone')).toBe(true);
    expect(PRO_EFFECTS.has('rgbsplit')).toBe(false);
  });
});
