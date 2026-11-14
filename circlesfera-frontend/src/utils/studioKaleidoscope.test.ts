import { describe, expect, it } from 'vitest';
import {
  effectAmounts,
  effectFilter,
  kaleidoscopeGraph,
  kaleidoscopeSource,
  PRO_EFFECTS,
} from './studioEffects';

describe('the kaleidoscope effect', () => {
  it('takes every pixel from the top left quarter, mirrored', () => {
    // A 4 x 2 picture: the quarter is 2 x 1.
    expect(kaleidoscopeSource(0, 0, 4, 2)).toEqual([0, 0]);
    expect(kaleidoscopeSource(1, 0, 4, 2)).toEqual([1, 0]);
    expect(kaleidoscopeSource(2, 0, 4, 2)).toEqual([1, 0]);
    expect(kaleidoscopeSource(3, 0, 4, 2)).toEqual([0, 0]);
    expect(kaleidoscopeSource(3, 1, 4, 2)).toEqual([0, 0]);
    expect(kaleidoscopeSource(1, 1, 4, 2)).toEqual([1, 0]);
  });

  it('exports the quarter cropped, flipped, stacked and blended by the intensity', () => {
    const graph = kaleidoscopeGraph('e0', 0.4);
    expect(graph).toContain('crop=iw/2:ih/2:0:0');
    expect(graph).toContain('hflip');
    expect(graph).toContain('vflip');
    expect(graph).toContain('hstack');
    expect(graph).toContain('vstack');
    expect(graph.endsWith('blend=all_mode=normal:all_opacity=0.4')).toBe(true);
    expect(effectAmounts('kaleidoscope', 40, 1080)).toEqual({ amount: 0.4 });
    expect(
      effectFilter(
        { effect: 'kaleidoscope', intensity: 40 } as never,
        1080,
        1920,
        'e0',
      ),
    ).toBe(graph);
  });

  it('comes with Edits Studio Pro', () => {
    expect(PRO_EFFECTS.has('kaleidoscope')).toBe(true);
  });
});
