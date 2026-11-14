import { describe, expect, it } from 'vitest';
import {
  BEZIER_PIECES,
  bezier,
  bezierPoints,
  CURVE_PRESETS,
  curveExpr,
  curveValue,
  isBezier,
  isProCurve,
  type KeyCurve,
} from './studioCurves';

// An ffmpeg expression of u, worked out as ffmpeg does: the functions it
// uses, written in JavaScript.
function evaluate(expr: string, u: number): number {
  const js = expr.replace(/\\,/g, ',');
  const fns = {
    clip: (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x)),
    pow: Math.pow,
    sin: Math.sin,
    lt: (a: number, b: number) => (a < b ? 1 : 0),
    lte: (a: number, b: number) => (a <= b ? 1 : 0),
    gte: (a: number, b: number) => (a >= b ? 1 : 0),
    if: (c: number, a: number, b: number) => (c ? a : b),
  };
  // `if` is a keyword in JavaScript: it is called through the table.
  const body = js.replace(/\bif\(/g, 'f_if(');
  return new Function(
    'u',
    'clip',
    'pow',
    'sin',
    'lt',
    'lte',
    'gte',
    'f_if',
    `return ${body};`,
  )(u, fns.clip, fns.pow, fns.sin, fns.lt, fns.lte, fns.gte, fns.if);
}

const CURVES: KeyCurve[] = [
  ...CURVE_PRESETS,
  bezier(0.25, 0.1, 0.25, 1),
  bezier(0.68, -0.6, 0.32, 1.6),
];
const SHARES = Array.from({ length: 41 }, (_, i) => i / 40);

describe('keyframe curves', () => {
  it.each(CURVES.map((c) => [JSON.stringify(c), c]))(
    '%s starts at 0, ends at 1, and the export gives what the preview shows',
    (_name, curve) => {
      expect(curveValue(curve, 0)).toBeCloseTo(0, 6);
      expect(curveValue(curve, 1)).toBeCloseTo(1, 6);
      for (const u of SHARES) {
        expect(evaluate(curveExpr(curve, 'u'), u)).toBeCloseTo(
          curveValue(curve, u),
          6,
        );
      }
    },
  );

  it('keeps the free curve as it always was, and holds outside the way', () => {
    expect(curveValue(undefined, 0.25)).toBeCloseTo(0.15625);
    expect(curveValue('smooth', 0.5)).toBe(0.5);
    expect(curveValue('linear', -1)).toBe(0);
    expect(curveValue('linear', 2)).toBe(1);
    expect(curveExpr(undefined, 'u')).toBe('u*u*(3-2*u)');
  });

  it('shapes each preset as named', () => {
    expect(curveValue('linear', 0.3)).toBeCloseTo(0.3);
    expect(curveValue('in', 0.5)).toBeLessThan(0.5);
    expect(curveValue('out', 0.5)).toBeGreaterThan(0.5);
    // Back goes past the end before settling.
    expect(
      Math.max(...SHARES.map((u) => curveValue('back', u))),
    ).toBeGreaterThan(1);
    // Elastic and bounce come back and forth near the end.
    expect(curveValue('elastic', 0.2)).toBeGreaterThan(1);
    expect(curveValue('bounce', 0.5)).toBeLessThan(curveValue('bounce', 0.35));
  });

  it('draws a curve of one own through points along the way, x rising', () => {
    const points = bezierPoints(bezier(0.42, 0, 0.58, 1));
    expect(points).toHaveLength(BEZIER_PIECES + 1);
    expect(points[0]).toEqual([0, 0]);
    expect(points[BEZIER_PIECES]).toEqual([1, 1]);
    // Symmetric control points: halfway is half the change.
    expect(points[BEZIER_PIECES / 2][1]).toBeCloseTo(0.5, 4);
  });

  it('brings the control points into range, and tells which curves need Pro', () => {
    expect(bezier(-1, 5, 2, -3)).toEqual({ bezier: [0, 2, 1, -1] });
    expect(isBezier(bezier(0, 0, 1, 1))).toBe(true);
    expect(isBezier('linear')).toBe(false);
    expect(isBezier(undefined)).toBe(false);
    expect(isProCurve(undefined)).toBe(false);
    expect(isProCurve('smooth')).toBe(false);
    expect(isProCurve('bounce')).toBe(true);
    expect(isProCurve(bezier(0.1, 0.2, 0.3, 0.4))).toBe(true);
  });
});
