import { describe, expect, it } from 'vitest';
import { mediaClip } from '../test/studio-fixtures';
import type { Keyframe, MediaClip } from '../types/studio';
import {
  AMOUNTS,
  animatedOpacity,
  animatedRotation,
  animatedScale,
  colorAfter,
  colorBefore,
  commandScript,
  contrastOf,
  filterAt,
  placeExpr,
  sidesOf,
} from './studioKeyframeExport';
import { valueAt } from './studioKeyframes';

const k = (pairs: [number, number][]): Keyframe[] =>
  pairs.map(([t, v]) => ({ t, v }));
const animated = (
  keyframes: MediaClip['keyframes'],
  over: Partial<MediaClip> = {},
) => mediaClip('a', { startAt: 0, duration: 4, keyframes, ...over });

describe('an animated colour amount', () => {
  it('blends in its farthest change each way by the share of the way there', () => {
    const clip = animated({
      exposure: k([
        [0, -100],
        [4, 100],
      ]),
    });
    const [up, down] = sidesOf(clip, AMOUNTS.exposure);
    expect(up.far).toBe(2);
    expect(down.far).toBe(0.5);
    // Halfway up at the value that doubles the light halfway.
    const t = 3;
    const amount = 2 ** (valueAt(clip, 'exposure', t) / 100);
    expect(up.share(t)).toBeCloseTo((amount - 1) / (2 - 1));
    expect(down.share(t)).toBe(0);
    expect(down.share(0)).toBeCloseTo(0.9999);
  });

  it('has no side that leaves the picture as it is', () => {
    expect(
      sidesOf(
        animated({
          brightness: k([
            [0, 0],
            [2, 50],
          ]),
        }),
        AMOUNTS.dim,
      ),
    ).toEqual([]);
  });
});

describe('the colour of an animated clip', () => {
  it('sends each blend its share frame by frame, and leaves fixed ones as they are', () => {
    const clip = animated({
      brightness: k([
        [0, -100],
        [2, 100],
      ]),
      contrast: k([
        [0, 0],
        [4, 50],
      ]),
    });
    const before = colorBefore(clip, 1080, 'c0');
    expect(before.filter).toContain(
      '[c0d0r][c0d0p]blend@c0d0=all_mode=normal:all_opacity=0.9999',
    );
    expect(before.filter).toContain(':eval=frame');
    expect(before.commands.map((c) => c.target)).toEqual(['blend@c0d0']);
    expect(before.commands[0].at(2)).toBe(0);
    const after = colorAfter(clip, 'c0');
    expect(after.filter).toContain("lutrgb=r='clip(val+128\\,0\\,255)'");
    expect(after.commands[0].at(2)).toBeCloseTo(0.9999);
    expect(after.commands[0].at(0)).toBe(0);
  });

  it('draws fixed colour once, at its own amounts', () => {
    const clip = mediaClip('b', {
      color: {
        brightness: -50,
        contrast: 20,
        saturation: -100,
        warmth: 40,
        exposure: 0,
        sharpness: -50,
      },
    });
    const before = colorBefore(clip, 540, 'c1');
    expect(before.commands).toEqual([]);
    expect(before.filter).toBe(
      "format=rgba,lutrgb=r='clip(val*0.75\\,0\\,255)':g='clip(val*0.75\\,0\\,255)':b='clip(val*0.75\\,0\\,255)',eq=contrast=1.2:saturation=0,split[c1sp][c1sq];[c1sq]gblur=sigma=1.5[c1sr];[c1sr][c1sp]blend=all_mode=normal:all_opacity=0.5",
    );
    const after = colorAfter(clip, 'c1');
    expect(after.filter).toContain(
      'blend@c1w=all_mode=softlight:all_opacity=0.14',
    );
    expect(colorBefore(mediaClip('c'), 1080, 'c2')).toEqual({
      filter: '',
      commands: [],
    });
    expect(colorAfter(mediaClip('c'), 'c2')).toEqual({
      filter: '',
      commands: [],
    });
  });

  it('sends warmth to its soft light blend directly, cool and warm apart', () => {
    const clip = animated({
      warmth: k([
        [0, -100],
        [4, 100],
      ]),
    });
    const after = colorAfter(clip, 'c3');
    expect(after.commands.map((c) => c.target)).toEqual([
      'blend@c3w',
      'blend@c3k',
    ]);
    expect(after.commands[0].at(4)).toBeCloseTo(0.35);
    expect(after.commands[1].at(0)).toBeCloseTo(0.35);
    expect(after.commands[0].at(0)).toBe(0);
  });

  it('weighs contrast as the preview does', () => {
    expect([contrastOf(100), contrastOf(-100), contrastOf(0)]).toEqual([
      2, 0.5, 1,
    ]);
  });
});

describe('a colour filter at its intensity', () => {
  const fx = 'hue=s=0';
  it('is all of it, none of it, or the filtered picture over the plain one', () => {
    expect(filterAt(mediaClip('a'), fx, 'f0').filter).toBe(fx);
    expect(
      filterAt(mediaClip('a', { filterIntensity: 0 }), fx, 'f0').filter,
    ).toBe('');
    expect(
      filterAt(mediaClip('a', { filterIntensity: 40 }), fx, 'f0').filter,
    ).toBe(
      'format=rgba,split[f0a][f0b];[f0b]hue=s=0,format=rgba[f0c];[f0c][f0a]blend=all_mode=normal:all_opacity=0.4',
    );
    expect(filterAt(mediaClip('a'), '', 'f0').filter).toBe('');
  });

  it('follows its keyframes, sent frame by frame', () => {
    const clip = animated({
      filter: k([
        [0, 0],
        [4, 100],
      ]),
    });
    const part = filterAt(clip, fx, 'f1');
    expect(part.filter).toContain('blend@f10=all_mode=normal');
    expect(part.commands[0].at(2)).toBeCloseTo(0.5);
  });
});

describe('placing an animated clip', () => {
  it('grows on a clear frame as large as its largest size', () => {
    const clip = animated({
      scale: k([
        [0, 0.5],
        [4, 1.5],
      ]),
    });
    expect(animatedScale(clip, 101, 200)).toMatch(
      /^format=rgba,scale=w='max\(1\\,iw\*\(.*\)\)':h=.*:eval=frame,pad=w=152:h=300:x='\(ow-iw\)\/2':y='\(oh-ih\)\/2':color=black@0:eval=frame$/,
    );
  });

  it('turns on a frame that keeps its size, and fades by its alpha', () => {
    const clip = animated({
      rotation: k([
        [0, 0],
        [4, 90],
      ]),
      opacity: k([
        [0, 1],
        [4, 0],
      ]),
    });
    expect(animatedRotation(clip)).toMatch(
      /^rotate=a='\(.*\)\*PI\/180':ow='hypot\(iw\\,ih\)':oh=ow:c=none$/,
    );
    const fade = animatedOpacity(clip, 'o1');
    expect(fade.filter).toBe('format=rgba,colorchannelmixer@o1=aa=1');
    expect(fade.commands[0].at(2)).toBeCloseTo(0.5);
  });

  it('moves in export pixels, by keyframes or by its own place', () => {
    expect(
      placeExpr(
        mediaClip('a', { transform: { scale: 1, rotation: 0, x: 90, y: 0 } }),
        'x',
        't',
        0.5,
      ),
    ).toBe('45');
    expect(
      placeExpr(
        animated({
          x: k([
            [0, 0],
            [2, 100],
          ]),
        }),
        'x',
        '(t-1)',
        2,
      ),
    ).toMatch(/^\(0\+100\*clip\(\(\(t-1\)-0\)\/2/);
  });
});

describe('the frame-by-frame script', () => {
  it('sends every command at every frame of the clip, in its own time', () => {
    const script = commandScript(
      [
        { target: 'blend@a', option: 'all_opacity', at: (t) => t },
        { target: 'colorchannelmixer@o', option: 'aa', at: () => 1 },
      ],
      0.1,
      30,
    );
    expect(script.split('\n')).toEqual([
      '0 blend@a all_opacity 0, colorchannelmixer@o aa 1;',
      '0.033333 blend@a all_opacity 0.033333, colorchannelmixer@o aa 1;',
      '0.066667 blend@a all_opacity 0.066667, colorchannelmixer@o aa 1;',
      '0.1 blend@a all_opacity 0.1, colorchannelmixer@o aa 1;',
    ]);
    expect(commandScript([], 3, 30)).toBe('');
  });
});
