import { describe, expect, it } from 'vitest';
import { mediaClip, studioProject, studioTrack } from '../test/studio-fixtures';
import {
  BLUE_SCREEN,
  chromaAmounts,
  chromaFilter,
  chromaKeep,
  compositeOf,
  GREEN_SCREEN,
  heartOutline,
  hexOf,
  isOverlayClip,
  needsOwnPicture,
  rgbOf,
  shapeFilter,
  shapeInsideExpr,
  shapePath,
} from './studioOverlay';

describe('a green screen', () => {
  it('turns strength and softness into colorkey’s similarity and blend', () => {
    expect(
      chromaAmounts({ color: GREEN_SCREEN, strength: 40, softness: 20 }),
    ).toEqual({
      similarity: 0.2,
      edge: 0.06,
    });
    expect(
      chromaAmounts({ color: GREEN_SCREEN, strength: 250, softness: -5 }),
    ).toEqual({
      similarity: 0.5,
      edge: 0,
    });
  });

  // What ffmpeg's colorkey kept of each colour, keyed on pure green with a
  // similarity of 0.2 and a blend of 0.1.
  it.each([
    ['#00ff00', 0],
    ['#20e020', 0],
    ['#40c040', 126],
    ['#60a060', 255],
    ['#808080', 255],
  ])('keeps of %s what ffmpeg keeps (%i of 255)', (color, kept) => {
    const [r, g, b] = rgbOf(color);
    const keep = chromaKeep(r, g, b, rgbOf(GREEN_SCREEN), {
      similarity: 0.2,
      edge: 0.1,
    });
    expect(Math.abs(Math.round(keep * 255) - kept)).toBeLessThanOrEqual(1);
  });

  it('cuts sharply with no softness', () => {
    const key = rgbOf(BLUE_SCREEN);
    expect(chromaKeep(0, 0, 250, key, { similarity: 0.1, edge: 0 })).toBe(0);
    expect(chromaKeep(200, 0, 0, key, { similarity: 0.1, edge: 0 })).toBe(1);
  });

  it('writes the colorkey filter, never with a similarity of 0', () => {
    expect(chromaFilter({ color: '#00ff00', strength: 40, softness: 20 })).toBe(
      'format=rgba,colorkey=0x00ff00:0.2:0.06',
    );
    expect(chromaFilter({ color: '#0000ff', strength: 0, softness: 0 })).toBe(
      'format=rgba,colorkey=0x0000ff:0.00001:0',
    );
  });

  it('reads and writes colours', () => {
    expect(rgbOf('#ff8000')).toEqual([255, 128, 0]);
    expect(rgbOf('nonsense')).toEqual([0, 0, 0]);
    expect(hexOf(255, 128.4, -3)).toBe('#ff8000');
  });
});

describe('a layer', () => {
  const project = studioProject([
    studioTrack('v1', 'video', [mediaClip('main')]),
    studioTrack('v2', 'video', [mediaClip('over')]),
    studioTrack('a1', 'audio', [mediaClip('song', { type: 'audio' })]),
  ]);

  it('is a clip on a video track above the main one', () => {
    expect(isOverlayClip(project, 'over')).toBe(true);
    expect(isOverlayClip(project, 'main')).toBe(false);
    expect(isOverlayClip(project, 'song')).toBe(false);
  });

  it('is drawn with the composite operation of its blend', () => {
    expect(compositeOf(undefined)).toBe('source-over');
    expect(compositeOf('normal')).toBe('source-over');
    expect(compositeOf('screen')).toBe('screen');
  });

  it('needs a picture of its own only to be keyed, cut or blended', () => {
    expect(needsOwnPicture(mediaClip('a'))).toBe(false);
    expect(
      needsOwnPicture(mediaClip('a', { shape: 'none', blend: 'normal' })),
    ).toBe(false);
    expect(needsOwnPicture(mediaClip('a', { shape: 'heart' }))).toBe(true);
    expect(needsOwnPicture(mediaClip('a', { blend: 'darken' }))).toBe(true);
    expect(
      needsOwnPicture(
        mediaClip('a', {
          chroma: { color: GREEN_SCREEN, strength: 1, softness: 1 },
        }),
      ),
    ).toBe(true);
  });
});

describe('shapes', () => {
  // The same test ffmpeg evaluates, at a point of a W×H picture.
  const inside = (
    shape: Parameters<typeof shapeInsideExpr>[0],
    X: number,
    Y: number,
    W = 200,
    H = 400,
  ): number => {
    const body = shapeInsideExpr(shape)
      .replaceAll('\\,', ',')
      .replace(/hypot/g, 'Math.hypot')
      .replace(/\bmin\(/g, 'Math.min(')
      .replace(/\babs\(/g, 'Math.abs(')
      .replace(/\bpow\(/g, 'Math.pow(');
    const test = new Function(
      'X',
      'Y',
      'W',
      'H',
      'lte',
      'gt',
      `return ${body};`,
    );
    return test(
      X,
      Y,
      W,
      H,
      (a: number, b: number) => (a <= b ? 1 : 0),
      (a: number, b: number) => (a > b ? 1 : 0),
    );
  };

  it('keeps a circle as wide as the shorter side', () => {
    expect(inside('circle', 100, 200)).toBe(1);
    expect(inside('circle', 100, 299)).toBe(1);
    expect(inside('circle', 100, 302)).toBe(0);
    expect(inside('circle', 5, 200)).toBe(1);
  });

  it('rounds the corners of a rectangle and keeps the rest', () => {
    expect(inside('rounded', 1, 1)).toBe(0);
    expect(inside('rounded', 100, 1)).toBe(1);
    expect(inside('rounded', 1, 200)).toBe(1);
    expect(inside('rounded', 30, 30)).toBe(1);
  });

  it('keeps a heart: its middle, not above its dip nor its corners', () => {
    expect(inside('heart', 100, 200)).toBe(1);
    expect(inside('heart', 100, 200 - 95)).toBe(0);
    expect(inside('heart', 2, 200)).toBe(0);
    expect(inside('heart', 100, 200 + 85)).toBe(1);
    expect(inside('none', 0, 0)).toBe(1);
  });

  it('outlines the heart the export keeps, the same on both sides', () => {
    const points = heartOutline(40);
    expect(points).toHaveLength(40);
    for (const [u, v] of points) {
      expect(Math.abs(u)).toBeLessThanOrEqual(1);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      // Each edge point sits on the edge the export tests.
      const X = 100 + u * 100;
      const Y = 200 + v * 100;
      const near = [
        inside('heart', X * 0.98 + 2, Y * 0.98 + 4),
        inside('heart', X, Y),
      ];
      expect(near).toContain(1);
    }
    const right = points.find(([u]) => u > 0.5) as [number, number];
    const mirrored = points.find(
      ([u, v]) =>
        Math.abs(u + right[0]) < 0.05 && Math.abs(v - right[1]) < 0.05,
    );
    expect(mirrored).toBeDefined();
  });

  it('lays out each shape’s path', () => {
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get:
          (_t, op: string) =>
          (...args: number[]) =>
            calls.push(`${op} ${args.slice(0, 2).join(',')}`),
      },
    ) as CanvasRenderingContext2D;
    shapePath(ctx, 'circle', 200, 400);
    expect(calls).toContain('arc 0,0');
    calls.length = 0;
    shapePath(ctx, 'rounded', 200, 400);
    expect(calls).toContain('roundRect -100,-200');
    calls.length = 0;
    shapePath(ctx, 'heart', 200, 400);
    expect(calls.filter((c) => c.startsWith('lineTo'))).toHaveLength(119);
    calls.length = 0;
    shapePath(ctx, 'none', 200, 400);
    expect(calls).toContain('rect -100,-200');
    expect(calls.at(-1)).toBe('closePath ');
  });

  it('cuts a clip to a shape on its alpha only', () => {
    expect(shapeFilter('circle', 's2')).toBe(
      `format=rgba,split[s2a][s2b];[s2b]alphaextract,geq=lum='p(X\\,Y)*${shapeInsideExpr('circle')}'[s2c];[s2a][s2c]alphamerge`,
    );
  });
});
