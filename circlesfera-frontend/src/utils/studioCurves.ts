/*
 * The curves of keyframes: how a value goes from one keyframe to the next.
 * Each is one function of the share u (0 to 1) of the way, used by the
 * preview, and the same function as an ffmpeg expression, used by the
 * export, so both look the same. "smooth" (ease in and out) is free and is
 * what a keyframe without a curve has; the others come with Edits Studio Pro.
 */

export type CurvePreset =
  | 'smooth'
  | 'linear'
  | 'in'
  | 'out'
  | 'back'
  | 'bounce'
  | 'elastic';

/** A curve of one's own: the two control points of a cubic Bézier. */
export interface BezierCurve {
  bezier: [x1: number, y1: number, x2: number, y2: number];
}

export type KeyCurve = CurvePreset | BezierCurve;

export const CURVE_PRESETS: readonly CurvePreset[] = [
  'smooth',
  'linear',
  'in',
  'out',
  'back',
  'bounce',
  'elastic',
];

/** The curve a keyframe without one has, free for everyone. */
export const FREE_CURVE: CurvePreset = 'smooth';

/** Control points stay in this range: x within the way, y may overshoot. */
export const BEZIER_X: readonly [number, number] = [0, 1];
export const BEZIER_Y: readonly [number, number] = [-1, 2];
/** How many straight pieces stand for a curve of one's own. */
export const BEZIER_PIECES = 24;

// The overshoot of "back", as in the usual easing tables.
const BACK = 1.70158;
const ELASTIC = (2 * Math.PI) / 3;

export function isBezier(curve: KeyCurve | undefined): curve is BezierCurve {
  return typeof curve === 'object' && curve !== null && 'bezier' in curve;
}

/** Whether a curve needs Edits Studio Pro to be chosen. */
export function isProCurve(curve: KeyCurve | undefined): boolean {
  return curve !== undefined && curve !== FREE_CURVE;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/** A curve of one's own with its points brought into range. */
export function bezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): BezierCurve {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    bezier: [
      round(clamp(x1, ...BEZIER_X)),
      round(clamp(y1, ...BEZIER_Y)),
      round(clamp(x2, ...BEZIER_X)),
      round(clamp(y2, ...BEZIER_Y)),
    ],
  };
}

function bounce(u: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) {
    const v = u - 1.5 / d;
    return n * v * v + 0.75;
  }
  if (u < 2.5 / d) {
    const v = u - 2.25 / d;
    return n * v * v + 0.9375;
  }
  const v = u - 2.625 / d;
  return n * v * v + 0.984375;
}

// A point of a cubic Bézier from (0,0) to (1,1) at its parameter s.
function cubic(p1: number, p2: number, s: number): number {
  const r = 1 - s;
  return 3 * r * r * s * p1 + 3 * r * s * s * p2 + s * s * s;
}

/**
 * The points a curve of one's own is drawn through: BEZIER_PIECES + 1
 * points (x, y), x rising from 0 to 1. Between two, the value goes in a
 * straight line, in the preview and in the export alike.
 */
export function bezierPoints(curve: BezierCurve): [number, number][] {
  const [x1, y1, x2, y2] = curve.bezier;
  const points: [number, number][] = [];
  for (let i = 0; i <= BEZIER_PIECES; i++) {
    const x = i / BEZIER_PIECES;
    // The parameter s where the curve's x is this x, by halving: x(s)
    // rises with s, as both control points are within 0 and 1.
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (cubic(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    const s = (lo + hi) / 2;
    points.push([x, Math.round(cubic(y1, y2, s) * 1e6) / 1e6]);
  }
  return points;
}

/** How far along the change a value is at a share u of the way. */
export function curveValue(curve: KeyCurve | undefined, u: number): number {
  const x = clamp(u, 0, 1);
  if (isBezier(curve)) {
    const points = bezierPoints(curve);
    const i = Math.min(Math.floor(x * BEZIER_PIECES), BEZIER_PIECES - 1);
    const [xa, ya] = points[i];
    const [xb, yb] = points[i + 1];
    return ya + ((yb - ya) * (x - xa)) / (xb - xa);
  }
  switch (curve ?? FREE_CURVE) {
    case 'linear':
      return x;
    case 'in':
      return x * x * x;
    case 'out':
      return 1 - (1 - x) ** 3;
    case 'back': {
      const v = x - 1;
      return 1 + (BACK + 1) * v * v * v + BACK * v * v;
    }
    case 'bounce':
      return bounce(x);
    case 'elastic':
      if (x === 0 || x === 1) return x;
      return 2 ** (-10 * x) * Math.sin((10 * x - 0.75) * ELASTIC) + 1;
    default:
      return x * x * (3 - 2 * x);
  }
}

const num = (n: number) => `${Math.round(n * 1e9) / 1e9}`;

/**
 * The same as an ffmpeg expression of an expression u already within 0
 * and 1. Commas are escaped for a quoted filter option.
 */
export function curveExpr(curve: KeyCurve | undefined, u: string): string {
  if (isBezier(curve)) {
    const points = bezierPoints(curve);
    // y0 + Σ (y[k+1] − y[k]) · clip((u − x[k]) / (x[k+1] − x[k]), 0, 1)
    const parts = [num(points[0][1])];
    for (let k = 0; k < points.length - 1; k++) {
      const [xa, ya] = points[k];
      const [xb, yb] = points[k + 1];
      const dy = yb - ya;
      if (dy === 0) continue;
      parts.push(`${num(dy)}*clip((${u}-${num(xa)})/${num(xb - xa)}\\,0\\,1)`);
    }
    return `(${parts.join('+')})`;
  }
  switch (curve ?? FREE_CURVE) {
    case 'linear':
      return `(${u})`;
    case 'in':
      return `(${u}*${u}*${u})`;
    case 'out':
      return `(1-pow(1-${u}\\,3))`;
    case 'back': {
      const v = `(${u}-1)`;
      return `(1+${num(BACK + 1)}*${v}*${v}*${v}+${num(BACK)}*${v}*${v})`;
    }
    case 'bounce': {
      const d = 2.75;
      const piece = (shift: number, add: number) =>
        `7.5625*(${u}-${num(shift / d)})*(${u}-${num(shift / d)})+${num(add)}`;
      return `(if(lt(${u}\\,${num(1 / d)})\\,7.5625*${u}*${u}\\,if(lt(${u}\\,${num(
        2 / d,
      )})\\,${piece(1.5, 0.75)}\\,if(lt(${u}\\,${num(2.5 / d)})\\,${piece(
        2.25,
        0.9375,
      )}\\,${piece(2.625, 0.984375)}))))`;
    }
    case 'elastic':
      return `(if(lte(${u}\\,0)\\,0\\,if(gte(${u}\\,1)\\,1\\,pow(2\\,-10*${u})*sin((10*${u}-0.75)*${num(
        ELASTIC,
      )})+1)))`;
    default:
      // A product only, as the export always wrote it: it needs no brackets.
      return `${u}*${u}*(3-2*${u})`;
  }
}
