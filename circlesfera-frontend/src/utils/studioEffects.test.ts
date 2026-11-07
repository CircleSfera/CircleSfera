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
  colorFilterAfter,
  colorFilterBefore,
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
      soften: 3,
    });
  });

  it('writes before the colour filter what the preview’s CSS draws', () => {
    expect(colorFilterBefore(NO_COLOR, 1080)).toBe('');
    expect(
      colorFilterBefore(
        {
          ...NO_COLOR,
          exposure: 100,
          contrast: 20,
          saturation: -50,
          sharpness: -50,
        },
        540,
      ),
    ).toBe(
      [
        "lutrgb=r='clip(val*2\\,0\\,255)':g='clip(val*2\\,0\\,255)':b='clip(val*2\\,0\\,255)'",
        'eq=contrast=1.2:saturation=0.5',
        'gblur=sigma=0.75',
      ].join(','),
    );
    // The lift of brightness is laid on after, not here.
    expect(colorFilterBefore({ ...NO_COLOR, brightness: 40 }, 1080)).toBe('');
  });

  it('writes after the colour filter the lift, warmth and sharpening, keeping the alpha', () => {
    expect(colorFilterAfter(NO_COLOR, 'c0')).toBe('');
    const m = '0 -0.15 0 -0.15 1.6 -0.15 0 -0.15 0';
    expect(
      colorFilterAfter(
        { ...NO_COLOR, brightness: 40, warmth: 50, sharpness: 40 },
        'c0',
      ),
    ).toBe(
      [
        'format=rgba,split[c0a][c0b];[c0b]alphaextract[c0c];[c0a]format=gbrp',
        "lutrgb=r='clip(val+51\\,0\\,255)':g='clip(val+51\\,0\\,255)':b='clip(val+51\\,0\\,255)'",
        'split[c0w][c0x];[c0x]drawbox=c=0xff9a3c@1:t=fill[c0y];[c0w][c0y]blend=all_mode=softlight:all_opacity=0.175',
        `convolution=0m='${m}':1m='${m}':2m='${m}'`,
        'format=rgba[c0d];[c0d][c0c]alphamerge',
      ].join(','),
    );
    expect(colorFilterAfter({ ...NO_COLOR, warmth: -20 }, 'c1')).toContain(
      'drawbox=c=0x3c8cff@1',
    );
  });

  it('writes the preview’s CSS filter for what CSS can draw', () => {
    expect(colorCssFilter(NO_COLOR, 1080)).toBe('');
    expect(
      colorCssFilter(
        {
          ...NO_COLOR,
          exposure: 100,
          contrast: 20,
          saturation: 10,
          sharpness: -100,
        },
        1080,
      ),
    ).toBe('brightness(2) contrast(1.2) saturate(1.1) blur(3px)');
  });
});
