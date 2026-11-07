import { describe, expect, it } from 'vitest';
import {
  effectClip,
  studioProject,
  studioTrack,
  textClip,
} from '../test/studio-fixtures';
import type { EffectKind } from '../types/studio';
import {
  activeColor,
  colorAmounts,
  colorCssFilter,
  EFFECT_KINDS,
  effectAmounts,
  effectClipsOf,
  effectFilter,
  NO_COLOR,
  shakeAt,
  vignetteDarkAt,
} from './studioEffects';

describe('effects', () => {
  it('reads the effects of the shown effects layers, in layer order', () => {
    const shown = studioTrack('fx1', 'effect', [
      effectClip('a'),
      textClip('t'),
    ]);
    const hidden = {
      ...studioTrack('fx2', 'effect', [effectClip('b')]),
      hidden: true,
    };
    const later = studioTrack('fx3', 'effect', [effectClip('c')]);
    expect(
      effectClipsOf(studioProject([shown, hidden, later])).map((c) => c.id),
    ).toEqual(['a', 'c']);
  });

  it('grows its sizes with the picture and its strength with the intensity', () => {
    expect(effectAmounts('blur', 100, 1080)).toEqual({ radius: 20 });
    expect(effectAmounts('blur', 50, 540)).toEqual({ radius: 5 });
    expect(effectAmounts('blur', 250, 1080)).toEqual({ radius: 20 });
    expect(effectAmounts('blur', -5, 1080)).toEqual({ radius: 0 });
    expect(effectAmounts('rgbsplit', 50, 1080)).toEqual({ shift: 11 });
    expect(effectAmounts('vignette', 100, 1080)).toEqual({ dark: 0.85 });
  });

  it.each([
    ['blur', /^gblur=sigma=10$/],
    [
      'glow',
      /^format=gbrp,split\[e0a\]\[e0b\];\[e0b\]gblur=sigma=12\[e0c\];\[e0a\]\[e0c\]blend=all_mode=screen:all_opacity=0\.5$/,
    ],
    ['grain', /^noise=alls=20:allf=t$/],
    [
      'shake',
      /^scale=.*,crop=w=1080:h=1920:x=\(iw-1080\)\/2\+16\.2\*sin\(2\*PI\*7\*t\):y=\(ih-1920\)\/2\+16\.2\*cos\(2\*PI\*5\*t\)$/,
    ],
    [
      'slowzoom',
      /^zoompan=z='1\+0\.15\*on\/90':d=1:x='iw\/2-\(iw\/zoom\/2\)':y='ih\/2-\(ih\/zoom\/2\)':s=1080x1920:fps=30$/,
    ],
    ['mono', /^hue=s=0\.5$/],
    ['rgbsplit', /^rgbashift=rh=-11:bh=11$/],
    ['vignette', /^format=rgba\[e0a\];\[e0a\]\[4:v\]overlay=0:0:format=auto$/],
  ] as [EffectKind, RegExp][])('draws %s with ffmpeg', (effect, pattern) => {
    expect(
      effectFilter(effectClip('x', { effect }), 1080, 1920, 'e0', '4:v'),
    ).toMatch(pattern);
  });

  it('has a filter for every effect offered', () => {
    for (const effect of EFFECT_KINDS) {
      expect(
        effectFilter(effectClip('x', { effect }), 1080, 1920, 'e', 'm'),
      ).not.toBe('');
    }
  });

  it('shakes along the same path in the preview and the export', () => {
    expect(shakeAt(10, 0)).toEqual({ x: 0, y: 10 });
    const later = shakeAt(10, 1 / 28);
    expect(later.x).toBeCloseTo(10);
  });

  it('darkens a vignette from none at the centre to all of it at the corners', () => {
    expect(vignetteDarkAt(0.8, 0)).toBe(0);
    expect(vignetteDarkAt(0.8, 0.5)).toBeCloseTo(0.2);
    expect(vignetteDarkAt(0.8, 1)).toBe(0.8);
  });
});

describe('picture adjustments', () => {
  it('counts only adjustments that change something', () => {
    expect(activeColor(undefined)).toBeNull();
    expect(activeColor(NO_COLOR)).toBeNull();
    const warm = { ...NO_COLOR, warmth: 10 };
    expect(activeColor(warm)).toBe(warm);
  });

  it('turns each slider into the same amounts for the preview and the export', () => {
    expect(colorAmounts({ ...NO_COLOR, brightness: 100 })).toMatchObject({
      lift: 0.5,
      scale: 1,
    });
    expect(colorAmounts({ ...NO_COLOR, brightness: -100 })).toMatchObject({
      lift: 0,
      scale: 0.5,
    });
    expect(colorAmounts({ ...NO_COLOR, exposure: 100 }).scale).toBe(2);
    expect(colorAmounts({ ...NO_COLOR, contrast: 100 }).contrast).toBe(2);
    expect(colorAmounts({ ...NO_COLOR, contrast: -100 }).contrast).toBe(0.5);
    expect(colorAmounts({ ...NO_COLOR, saturation: -100 }).saturation).toBe(0);
    expect(colorAmounts({ ...NO_COLOR, sharpness: 100 })).toMatchObject({
      sharpen: 1.5,
      soften: 0,
    });
    expect(colorAmounts({ ...NO_COLOR, sharpness: -400 })).toMatchObject({
      sharpen: 0,
      soften: 1,
    });
  });

  it('writes the preview’s CSS filter for what CSS can draw', () => {
    expect(colorCssFilter(NO_COLOR)).toBe('');
    expect(
      colorCssFilter({
        ...NO_COLOR,
        exposure: 100,
        contrast: 20,
        saturation: 10,
        sharpness: -100,
      }),
    ).toBe('brightness(2) contrast(1.2) saturate(1.1)');
  });
});
