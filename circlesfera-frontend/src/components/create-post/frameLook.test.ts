import { FRAME_LOOK_RANGES, type FrameLookKey } from '@circlesfera/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHOTO_ADJUSTMENTS,
  PHOTO_FILTERS,
} from '../photo-editor/photoEditor.constants';
import { buildPhotoFilterString } from '../photo-editor/photoEditor.look';
import {
  FRAME_FILTER_STRENGTH_MAX,
  filterClassLook,
  frameLookCss,
  frameLookFromFilterText,
  frameLookOf,
} from './frameLook';

const byName = (name: string) =>
  PHOTO_FILTERS.find((filter) => filter.name === name)?.class ?? '';

describe('frameLook', () => {
  it('reads every value a filter class stands for', () => {
    expect(filterClassLook(byName('Moon'))).toEqual({
      grayscale: 100,
      brightness: 110,
      contrast: 110,
    });
    expect(filterClassLook(byName('Aden'))).toEqual({
      sepia: 20,
      brightness: 120,
      saturation: 85,
      hue: 340,
    });
    expect(filterClassLook('')).toEqual({});
  });

  it('gives no look for no filter and no adjustment', () => {
    expect(frameLookOf('')).toEqual({});
    expect(frameLookOf(byName('Clarendon'), 0)).toEqual({});
  });

  it('scales a filter by its strength, turning the short way round', () => {
    expect(frameLookOf(byName('Gingham'))).toEqual({
      brightness: 105,
      contrast: 90,
      hue: 350,
    });
    // Half of a turn of -10 degrees is -5, not 175.
    expect(frameLookOf(byName('Gingham'), 50)).toEqual({
      brightness: 103,
      contrast: 95,
      hue: 355,
    });
  });

  it('puts the adjustments over the filter, within each range', () => {
    expect(
      frameLookOf(byName('Ludwig'), FRAME_FILTER_STRENGTH_MAX, {
        ...DEFAULT_PHOTO_ADJUSTMENTS,
        saturation: 200,
        sepia: 95,
        temperature: 130,
        vignette: 40,
      }),
    ).toEqual({
      sepia: 100,
      saturation: 200,
      brightness: 105,
      temperature: 130,
      vignette: 40,
    });
  });

  it('gives every filter as whole numbers the server takes', () => {
    for (const filter of PHOTO_FILTERS) {
      for (const [key, value] of Object.entries(frameLookOf(filter.class))) {
        const range = FRAME_LOOK_RANGES[key as FrameLookKey];
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(range.min);
        expect(value).toBeLessThanOrEqual(range.max);
      }
    }
  });

  it('reads the look out of the photo editor’s filter text', () => {
    const text = buildPhotoFilterString(byName('Moon'), {
      ...DEFAULT_PHOTO_ADJUSTMENTS,
      brightness: 90,
      hue: 15,
      blur: 2,
      noise: 30,
    });
    expect(frameLookFromFilterText(text)).toEqual({
      grayscale: 100,
      brightness: 99,
      contrast: 110,
      hue: 15,
      blur: 2,
      noise: 30,
    });
    expect(frameLookFromFilterText(undefined)).toEqual({});
    expect(frameLookFromFilterText('')).toEqual({});
  });

  it('shows the look on the video, grayscale as no colour', () => {
    expect(frameLookCss({ grayscale: 100, brightness: 110 })).toBe(
      'brightness(110%) contrast(100%) saturate(0%) sepia(0%) hue-rotate(0deg) blur(0px)',
    );
  });
});
