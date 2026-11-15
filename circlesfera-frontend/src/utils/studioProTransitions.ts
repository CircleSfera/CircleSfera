import type { TransitionKind } from '../types/studio';

/*
 * The transitions that come with Edits Studio Pro. Each moves the end of the
 * outgoing clip and the start of the incoming one, and the picture cuts from
 * one to the other halfway through. The movement is one function of a pixel,
 * used by the preview, and the same as an ffmpeg geq expression, used by the
 * export, so both draw the same pixels. Pixels are read at whole positions,
 * clamped to the edges (black outside the picture for a spin).
 */

export type ProTransitionKind = 'whip' | 'glitch' | 'spin' | 'zoomblur';

/** The transitions that come with Edits Studio Pro: chosen only with it. */
export const PRO_TRANSITIONS: ReadonlySet<TransitionKind> = new Set([
  'whip',
  'glitch',
  'spin',
  'zoomblur',
]);

export function isProTransition(
  kind: TransitionKind,
): kind is ProTransitionKind {
  return PRO_TRANSITIONS.has(kind);
}

/** The ffmpeg xfade that cuts from one clip to the other halfway. */
export const XFADE_CUT = "custom:expr='if(gt(P\\,0.5)\\,A\\,B)'";

/** The outgoing clip's end, or the incoming clip's start. */
export type TransitionSide = 'out' | 'in';

// Whip pan: the picture flies sideways, smeared along the way.
const WHIP_SHIFT = 0.5;
const WHIP_SMEAR = 0.15;
const WHIP_TAPS = 5;
// Spin: a quarter turn and a push in, smeared along the turn.
const SPIN_TURN = Math.PI / 2;
const SPIN_PUSH = 0.4;
const SPIN_SMEAR = 0.12;
// Zoom blur: copies pushed in further and further, averaged.
const ZOOM_PUSH = 0.6;
const ZOOM_TAPS = 5;
// Glitch: bands of the picture jump sideways a dozen times a second, with
// red and blue pulled apart.
const GLITCH_BAND = 0.06;
const GLITCH_HZ = 12;
const GLITCH_SHIFT = 0.15;
const GLITCH_SPLIT = 0.03;

/**
 * How strong the movement is at a moment t of a transition lasting dur: it
 * grows to the cut on the outgoing side and fades after it on the incoming
 * one, faster near the cut.
 */
export function sideAmount(side: TransitionSide, t: number, dur: number) {
  const u = t / Math.max(dur, 0.01);
  const s = Math.max(0, Math.min(1, side === 'out' ? 2 * u : 2 - 2 * u));
  return s * s;
}

function amountExpr(side: TransitionSide, dur: number): string {
  const u = `T/${Math.max(dur, 0.01)}`;
  const s = side === 'out' ? `clip(2*${u}\\,0\\,1)` : `clip(2-2*${u}\\,0\\,1)`;
  return `(${s}*${s})`;
}

type Rgb = readonly [number, number, number];
type Reader = (x: number, y: number) => Rgb;

const clampTo = (n: number, hi: number) => Math.max(0, Math.min(hi, n));
// Rounds halves away from zero, as ffmpeg's round() does.
const roundHalf = (n: number) => Math.sign(n) * Math.round(Math.abs(n));
const byte = (n: number) => clampTo(Math.round(n), 255);

/** Where a tap of a spin reads, or null outside the picture. */
function spinAt(
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  push: number,
): [number, number] | null {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const dx = x - cx;
  const dy = y - cy;
  const u = roundHalf(
    (dx * Math.cos(angle) + dy * Math.sin(angle)) / push + cx,
  );
  const v = roundHalf(
    (-dx * Math.sin(angle) + dy * Math.cos(angle)) / push + cy,
  );
  if (u < 0 || u > width - 1 || v < 0 || v > height - 1) return null;
  return [u, v];
}

/** The glitch's sideways jump of a band of rows at a moment, in pixels. */
function glitchJump(
  y: number,
  width: number,
  height: number,
  t: number,
  a: number,
): number {
  const band = Math.floor(y / (height * GLITCH_BAND));
  const step = Math.floor(t * GLITCH_HZ);
  const n = Math.sin(band * 12.9898 + step * 78.233) * 43758.5453;
  const h = n - Math.floor(n);
  return roundHalf((h - 0.5) * 2 * a * width * GLITCH_SHIFT);
}

/**
 * One pixel of a side of a Pro transition at a moment t of it (from its
 * start), read from that side's picture by `at`.
 */
export function proTransitionPixel(
  kind: ProTransitionKind,
  side: TransitionSide,
  at: Reader,
  x: number,
  y: number,
  width: number,
  height: number,
  t: number,
  dur: number,
): [number, number, number] {
  const a = sideAmount(side, t, dur);
  const sign = side === 'out' ? 1 : -1;
  const sum = [0, 0, 0];
  switch (kind) {
    case 'whip': {
      const shift = sign * a * width * WHIP_SHIFT;
      const smear = a * width * WHIP_SMEAR;
      for (let i = 0; i < WHIP_TAPS; i++) {
        const dx = shift + smear * ((2 * i) / (WHIP_TAPS - 1) - 1);
        const px = at(clampTo(roundHalf(x + dx), width - 1), y);
        for (let c = 0; c < 3; c++) sum[c] += px[c];
      }
      return sum.map((v) => byte(v / WHIP_TAPS)) as [number, number, number];
    }
    case 'spin': {
      const turn = sign * a * SPIN_TURN;
      const push = 1 + a * SPIN_PUSH;
      for (const j of [-1, 0, 1]) {
        const p = spinAt(x, y, width, height, turn + j * a * SPIN_SMEAR, push);
        if (!p) continue;
        const px = at(p[0], p[1]);
        for (let c = 0; c < 3; c++) sum[c] += px[c];
      }
      return sum.map((v) => byte(v / 3)) as [number, number, number];
    }
    case 'zoomblur': {
      const cx = (width - 1) / 2;
      const cy = (height - 1) / 2;
      for (let i = 0; i < ZOOM_TAPS; i++) {
        const push = 1 + a * ZOOM_PUSH * (i / (ZOOM_TAPS - 1));
        const px = at(
          roundHalf((x - cx) / push + cx),
          roundHalf((y - cy) / push + cy),
        );
        for (let c = 0; c < 3; c++) sum[c] += px[c];
      }
      return sum.map((v) => byte(v / ZOOM_TAPS)) as [number, number, number];
    }
    case 'glitch': {
      const jump = glitchJump(y, width, height, t, a);
      const split = roundHalf(a * width * GLITCH_SPLIT);
      const read = (dx: number) => at(clampTo(x + jump + dx, width - 1), y);
      return [read(split)[0], read(0)[1], read(-split)[2]];
    }
  }
}

// Negative numbers in brackets: ffmpeg reads "+-" and "*-" badly.
const num = (n: number) => {
  const v = Math.round(n * 1e9) / 1e9;
  return v < 0 ? `(${v})` : `${v}`;
};

/**
 * The same as an ffmpeg graph on that side's stretch, with T from the
 * transition's start: in RGB, each plane a geq expression.
 */
export function proTransitionGeq(
  kind: ProTransitionKind,
  side: TransitionSide,
  dur: number,
): string {
  const a = amountExpr(side, dur);
  const sign = side === 'out' ? '1' : '(-1)';
  const cx = '((W-1)/2)';
  const cy = '((H-1)/2)';
  const plane = (fn: 'r' | 'g' | 'b'): string => {
    switch (kind) {
      case 'whip': {
        const taps = Array.from({ length: WHIP_TAPS }, (_, i) => {
          const k = num((2 * i) / (WHIP_TAPS - 1) - 1);
          const dx = `(${sign}*${a}*W*${WHIP_SHIFT}+${a}*W*${WHIP_SMEAR}*${k})`;
          return `${fn}(clip(round(X+${dx})\\,0\\,W-1)\\,Y)`;
        });
        return `clip(round((${taps.join('+')})/${WHIP_TAPS})\\,0\\,255)`;
      }
      case 'spin': {
        const push = `(1+${a}*${SPIN_PUSH})`;
        const taps = [-1, 0, 1].map((j) => {
          const angle = `(${sign}*${a}*${num(SPIN_TURN)}+${num(j)}*${a}*${SPIN_SMEAR})`;
          const u = `round(((X-${cx})*cos(${angle})+(Y-${cy})*sin(${angle}))/${push}+${cx})`;
          const v = `round(((-1)*(X-${cx})*sin(${angle})+(Y-${cy})*cos(${angle}))/${push}+${cy})`;
          const inside = `between(${u}\\,0\\,W-1)*between(${v}\\,0\\,H-1)`;
          return `if(${inside}\\,${fn}(${u}\\,${v})\\,0)`;
        });
        return `clip(round((${taps.join('+')})/3)\\,0\\,255)`;
      }
      case 'zoomblur': {
        const taps = Array.from({ length: ZOOM_TAPS }, (_, i) => {
          const push = `(1+${a}*${ZOOM_PUSH}*${num(i / (ZOOM_TAPS - 1))})`;
          return `${fn}(round((X-${cx})/${push}+${cx})\\,round((Y-${cy})/${push}+${cy}))`;
        });
        return `clip(round((${taps.join('+')})/${ZOOM_TAPS})\\,0\\,255)`;
      }
      case 'glitch': {
        const band = `floor(Y/(H*${GLITCH_BAND}))`;
        const step = `floor(T*${GLITCH_HZ})`;
        const n = `(sin(${band}*12.9898+${step}*78.233)*43758.5453)`;
        const jump = `round((${n}-floor(${n})-0.5)*2*${a}*W*${GLITCH_SHIFT})`;
        const split = `round(${a}*W*${GLITCH_SPLIT})`;
        const dx = fn === 'r' ? `+${split}` : fn === 'b' ? `-${split}` : '';
        return `${fn}(clip(X+${jump}${dx}\\,0\\,W-1)\\,Y)`;
      }
    }
  };
  return `format=gbrp,geq=r='${plane('r')}':g='${plane('g')}':b='${plane('b')}':interpolation=nearest`;
}

/**
 * The filters that give a clip of the main track the movement of the Pro
 * transitions on either side of it: its start moves as the incoming side of
 * the one before it, its end as the outgoing side of its own. Only those
 * stretches are changed; the rest of the clip passes as it is. Returns the
 * label of the result and the filters, or nothing when neither is Pro.
 */
export function proTransitionSides(
  label: string,
  length: number,
  fps: number,
  into?: { kind: TransitionKind; duration: number },
  out?: { kind: TransitionKind; duration: number },
): { label: string; filters: string[] } | null {
  const head = into && isProTransition(into.kind) ? into : undefined;
  const tail = out && isProTransition(out.kind) ? out : undefined;
  if (!head && !tail) return null;
  const from = head ? head.duration : 0;
  const to = tail ? length - tail.duration : length;
  const pieces: { name: string; filter: string }[] = [];
  const moved = (side: TransitionSide, kind: ProTransitionKind, d: number) =>
    `${proTransitionGeq(kind, side, d)},format=yuv420p`;
  if (head) {
    pieces.push({
      name: `${label}h`,
      filter: `trim=end=${num(from)},setpts=PTS-STARTPTS,${moved('in', head.kind as ProTransitionKind, head.duration)}`,
    });
  }
  // The middle, when it lasts at least half a frame.
  if (to - from >= 0.5 / fps) {
    pieces.push({
      name: `${label}b`,
      filter: `trim=start=${num(from)}:end=${num(to)},setpts=PTS-STARTPTS`,
    });
  }
  if (tail) {
    pieces.push({
      name: `${label}t`,
      filter: `trim=start=${num(to)},setpts=PTS-STARTPTS,${moved('out', tail.kind as ProTransitionKind, tail.duration)}`,
    });
  }
  const result = `${label}x`;
  const split = pieces.map((p) => `[${p.name}s]`).join('');
  return {
    label: result,
    filters: [
      `[${label}]split=${pieces.length}${split}`,
      ...pieces.map((p) => `[${p.name}s]${p.filter}[${p.name}]`),
      `${pieces.map((p) => `[${p.name}]`).join('')}concat=n=${pieces.length}:v=1:a=0,setsar=1,settb=AVTB[${result}]`,
    ],
  };
}
