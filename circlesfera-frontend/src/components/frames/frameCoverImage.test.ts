import { describe, expect, it } from 'vitest';
import { coverCrop } from './frameCoverImage';

describe('coverCrop', () => {
  it('takes the full height of a wide picture, from where it was placed', () => {
    const picture = { width: 1600, height: 900 };
    const width = (900 * 9) / 16;
    expect(coverCrop(picture, { x: 0, y: 0.5 })).toEqual({
      sx: 0,
      sy: 0,
      sw: width,
      sh: 900,
    });
    expect(coverCrop(picture, { x: 1, y: 0.5 }).sx).toBeCloseTo(1600 - width);
    expect(coverCrop(picture, { x: 0.5, y: 0.5 }).sx).toBeCloseTo(
      (1600 - width) / 2,
    );
  });

  it('takes the full width of a tall picture, and never leaves it', () => {
    const picture = { width: 900, height: 2400 };
    const height = (900 * 16) / 9;
    expect(coverCrop(picture, { x: 0.5, y: 1 }).sy).toBeCloseTo(2400 - height);
    expect(coverCrop(picture, { x: 0.5, y: 2 }).sy).toBeCloseTo(2400 - height);
    expect(coverCrop(picture, { x: -1, y: -1 })).toMatchObject({
      sx: 0,
      sy: 0,
    });
  });
});
