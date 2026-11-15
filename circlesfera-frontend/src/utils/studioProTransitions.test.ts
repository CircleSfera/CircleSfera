import { describe, expect, it } from 'vitest';
import {
  isProTransition,
  type ProTransitionKind,
  proTransitionGeq,
  proTransitionPixel,
  proTransitionSides,
  sideAmount,
  type TransitionSide,
  XFADE_CUT,
} from './studioProTransitions';
import { TRANSITION_KINDS, XFADE_OF } from './studioTransitions';

const KINDS: ProTransitionKind[] = ['whip', 'glitch', 'spin', 'zoomblur'];
const SIDES: TransitionSide[] = ['out', 'in'];
const W = 24;
const H = 40;
const DUR = 0.5;

// A small picture with a different value in every pixel and plane.
const picture = (x: number, y: number) =>
  [(x * 7 + y * 3) % 256, (x * 2 + y * 11) % 256, (x * 13 + y) % 256] as const;

// The geq expression of each plane, read back into JavaScript with ffmpeg's
// functions: round() takes halves away from zero, between() includes both
// ends, and r/g/b read the picture at a whole position.
function planes(kind: ProTransitionKind, side: TransitionSide) {
  const filter = proTransitionGeq(kind, side, DUR);
  const found = [...filter.matchAll(/([rgb])='([^']*)'/g)];
  expect(found.map((m) => m[1])).toEqual(['r', 'g', 'b']);
  return found.map(([, , expr]) => {
    const body = expr
      .replace(/\\,/g, ',')
      .replace(/\bif\(/g, 'f_if(')
      .replace(/\b([rgb])\(/g, 'px_$1(');
    return new Function(
      'X',
      'Y',
      'W',
      'H',
      'T',
      'fn',
      `const {clip,round,floor,sin,cos,between,f_if,px_r,px_g,px_b}=fn;return ${body};`,
    ) as (
      x: number,
      y: number,
      w: number,
      h: number,
      t: number,
      fn: object,
    ) => number;
  });
}

const fns = {
  clip: (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x)),
  round: (n: number) => Math.sign(n) * Math.round(Math.abs(n)),
  floor: Math.floor,
  sin: Math.sin,
  cos: Math.cos,
  between: (x: number, lo: number, hi: number) => (x >= lo && x <= hi ? 1 : 0),
  f_if: (c: number, a: number, b: number) => (c ? a : b),
  px_r: (x: number, y: number) => picture(x, y)[0],
  px_g: (x: number, y: number) => picture(x, y)[1],
  px_b: (x: number, y: number) => picture(x, y)[2],
};

describe('the Edits Studio Pro transitions', () => {
  it('are the last four of the list, each cut halfway by the join', () => {
    expect(TRANSITION_KINDS.slice(-4)).toEqual(KINDS);
    for (const kind of KINDS) {
      expect(isProTransition(kind)).toBe(true);
      expect(XFADE_OF[kind]).toBe(XFADE_CUT);
    }
    expect(isProTransition('crossfade')).toBe(false);
  });

  it('move most at the cut and not at all at either end', () => {
    expect(sideAmount('out', 0, DUR)).toBe(0);
    expect(sideAmount('out', DUR / 2, DUR)).toBe(1);
    expect(sideAmount('in', DUR / 2, DUR)).toBe(1);
    expect(sideAmount('in', DUR, DUR)).toBe(0);
    expect(sideAmount('out', DUR / 4, DUR)).toBeCloseTo(0.25);
  });

  it.each(KINDS.flatMap((kind) => SIDES.map((side) => [kind, side] as const)))(
    '%s, %s side: the export gives what the preview shows',
    (kind, side) => {
      const exprs = planes(kind, side);
      for (const t of [0, 0.1, 0.2, 0.25, 0.3, 0.45, 0.5]) {
        for (let y = 0; y < H; y += 3) {
          for (let x = 0; x < W; x += 2) {
            const preview = proTransitionPixel(
              kind,
              side,
              picture,
              x,
              y,
              W,
              H,
              t,
              DUR,
            );
            const exported = exprs.map((f) => f(x, y, W, H, t, fns));
            expect(exported).toEqual(preview);
          }
        }
      }
    },
  );

  it('leave the picture as it is where they do not move it', () => {
    for (const kind of KINDS) {
      for (const [side, t] of [
        ['out', 0],
        ['in', DUR],
      ] as const) {
        expect(
          proTransitionPixel(kind, side, picture, 5, 9, W, H, t, DUR),
        ).toEqual([...picture(5, 9)]);
      }
    }
  });

  it('write geq that the export ffmpeg reads: nearest pixel, no "+-" or "*-"', () => {
    for (const kind of KINDS) {
      for (const side of SIDES) {
        const filter = proTransitionGeq(kind, side, DUR);
        expect(filter.startsWith('format=gbrp,geq=r=')).toBe(true);
        expect(filter.endsWith(':interpolation=nearest')).toBe(true);
        expect(filter).not.toMatch(/[+*]-/);
      }
    }
  });
});

describe('moving the sides of a clip', () => {
  const pro = { kind: 'whip' as const, duration: 0.5 };
  const plain = { kind: 'crossfade' as const, duration: 0.5 };

  it('does nothing beside transitions that are not Pro', () => {
    expect(proTransitionSides('m0', 3, 30, plain, plain)).toBeNull();
    expect(proTransitionSides('m0', 3, 30)).toBeNull();
  });

  it('moves only the end before a Pro transition', () => {
    const sides = proTransitionSides('m0', 3, 30, plain, pro);
    expect(sides?.label).toBe('m0x');
    expect(sides?.filters[0]).toBe('[m0]split=2[m0bs][m0ts]');
    expect(sides?.filters[1]).toBe(
      '[m0bs]trim=start=0:end=2.5,setpts=PTS-STARTPTS[m0b]',
    );
    expect(sides?.filters[2]).toMatch(
      /^\[m0ts\]trim=start=2\.5,setpts=PTS-STARTPTS,format=gbrp,geq=.*,format=yuv420p\[m0t\]$/,
    );
    expect(sides?.filters[3]).toBe(
      '[m0b][m0t]concat=n=2:v=1:a=0,setsar=1,settb=AVTB[m0x]',
    );
  });

  it('moves the start after a Pro transition and the end before another', () => {
    const sides = proTransitionSides(
      'm1',
      3,
      30,
      { kind: 'spin', duration: 1 },
      { kind: 'glitch', duration: 0.4 },
    );
    expect(sides?.filters[0]).toBe('[m1]split=3[m1hs][m1bs][m1ts]');
    expect(sides?.filters[1]).toMatch(/^\[m1hs\]trim=end=1,/);
    expect(sides?.filters[2]).toBe(
      '[m1bs]trim=start=1:end=2.6,setpts=PTS-STARTPTS[m1b]',
    );
    expect(sides?.filters[3]).toMatch(/^\[m1ts\]trim=start=2\.6,/);
    expect(sides?.filters[4]).toBe(
      '[m1h][m1b][m1t]concat=n=3:v=1:a=0,setsar=1,settb=AVTB[m1x]',
    );
  });

  it('leaves out the middle when the two sides meet', () => {
    const sides = proTransitionSides('m2', 2, 30, pro, {
      kind: 'zoomblur',
      duration: 1.5,
    });
    expect(sides?.filters[0]).toBe('[m2]split=2[m2hs][m2ts]');
    expect(sides?.filters.at(-1)).toBe(
      '[m2h][m2t]concat=n=2:v=1:a=0,setsar=1,settb=AVTB[m2x]',
    );
  });
});
