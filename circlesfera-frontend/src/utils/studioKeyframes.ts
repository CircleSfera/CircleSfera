import type {
  Clip,
  ColorAdjustments,
  Keyframe,
  Keyframes,
  KeyProp,
  MediaClip,
  TextClip,
} from '../types/studio';

/** Two keyframes closer than this are at the same moment, in seconds. */
export const KEYFRAME_EPS = 1 / 60;
/** The most keyframes one property of a clip holds. */
export const MAX_KEYFRAMES = 50;

const COLOR_PROPS = [
  'brightness',
  'contrast',
  'saturation',
  'warmth',
  'exposure',
  'sharpness',
] as const satisfies readonly (KeyProp & keyof ColorAdjustments)[];

const PLACE_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity'] as const;

/** What can be animated on each kind of clip. Effects, as in CapCut, cannot. */
export function keyPropsOf(clip: Clip): readonly KeyProp[] {
  switch (clip.type) {
    case 'video':
      return [...PLACE_PROPS, 'volume', ...COLOR_PROPS, 'filter'];
    case 'image':
      return [...PLACE_PROPS, ...COLOR_PROPS, 'filter'];
    case 'audio':
      return ['volume'];
    case 'text':
      // Texts are not turned in the export, so not here either.
      return ['x', 'y', 'scale', 'opacity'];
    default:
      return [];
  }
}

/** The value a property has with no keyframes: the clip's own. */
export function baseValue(clip: Clip, prop: KeyProp): number {
  const media = clip as MediaClip;
  const transform = (clip as MediaClip | TextClip).transform;
  switch (prop) {
    case 'x':
      return transform?.x ?? 0;
    case 'y':
      return transform?.y ?? 0;
    case 'scale':
      return transform?.scale ?? 1;
    case 'rotation':
      return transform?.rotation ?? 0;
    case 'opacity':
      return clip.type === 'text'
        ? (clip.style.opacity ?? 1)
        : (media.opacity ?? 1);
    case 'volume':
      return media.volume ?? 1;
    case 'filter':
      return media.filterIntensity ?? 100;
    default:
      return media.color?.[prop] ?? 0;
  }
}

/** The clip with a property's own value set. */
export function withBaseValue<C extends Clip>(
  clip: C,
  prop: KeyProp,
  v: number,
): C {
  const placed = clip as unknown as MediaClip;
  const transform = placed.transform ?? { scale: 1, rotation: 0, x: 0, y: 0 };
  if (prop === 'x' || prop === 'y' || prop === 'scale' || prop === 'rotation') {
    return { ...clip, transform: { ...transform, [prop]: v } };
  }
  if (prop === 'opacity') {
    return clip.type === 'text'
      ? { ...clip, style: { ...(clip as TextClip).style, opacity: v } }
      : { ...clip, opacity: v };
  }
  if (prop === 'volume') return { ...clip, volume: v };
  if (prop === 'filter') return { ...clip, filterIntensity: v };
  const color: ColorAdjustments = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    warmth: 0,
    exposure: 0,
    sharpness: 0,
    ...placed.color,
  };
  return { ...clip, color: { ...color, [prop]: v } };
}

/** The ease between two keyframes: slow out of one and into the next. */
export function ease(u: number): number {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
}

const framesOf = (clip: Clip, prop: KeyProp): Keyframe[] =>
  clip.keyframes?.[prop] ?? [];

/** Whether a property of a clip is animated. */
export function isAnimated(clip: Clip, prop: KeyProp): boolean {
  return framesOf(clip, prop).length > 0;
}

/** Whether a clip has any keyframe. */
export function hasKeyframes(clip: Clip): boolean {
  return Object.values(clip.keyframes ?? {}).some((frames) => frames?.length);
}

/**
 * A property's value at a moment of the clip, in seconds from its start:
 * eased between the keyframes around it, held before the first and after
 * the last, and the clip's own value with none.
 */
export function valueAt(clip: Clip, prop: KeyProp, t: number): number {
  const frames = framesOf(clip, prop);
  if (!frames.length) return baseValue(clip, prop);
  if (t <= frames[0].t) return frames[0].v;
  const last = frames[frames.length - 1];
  if (t >= last.t) return last.v;
  const i = frames.findIndex((f) => f.t > t);
  const a = frames[i - 1];
  const b = frames[i];
  return a.v + (b.v - a.v) * ease((t - a.t) / (b.t - a.t));
}

/** The clip as it is at a moment of itself: every animated value set. */
export function clipAt<C extends Clip>(clip: C, t: number): C {
  if (!clip.keyframes) return clip;
  let at = clip;
  for (const prop of keyPropsOf(clip)) {
    if (isAnimated(clip, prop))
      at = withBaseValue(at, prop, valueAt(clip, prop, t));
  }
  return at;
}

/** The moments of a clip that hold a keyframe, earliest first. */
export function keyframeTimes(clip: Clip): number[] {
  const times: number[] = [];
  for (const frames of Object.values(clip.keyframes ?? {})) {
    for (const f of frames ?? []) {
      if (!times.some((t) => Math.abs(t - f.t) < KEYFRAME_EPS)) times.push(f.t);
    }
  }
  return times.sort((a, b) => a - b);
}

/** Whether a clip has a keyframe at a moment of itself. */
export function hasKeyframeAt(clip: Clip, t: number): boolean {
  return keyframeTimes(clip).some((k) => Math.abs(k - t) < KEYFRAME_EPS);
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

// The frames with one set at a moment, replacing one already there.
function withFrame(frames: Keyframe[], t: number, v: number): Keyframe[] {
  const kept = frames.filter((f) => Math.abs(f.t - t) >= KEYFRAME_EPS);
  if (kept.length >= MAX_KEYFRAMES) return frames;
  return [...kept, { t: round(t), v }].sort((a, b) => a.t - b.t);
}

function withFrames<C extends Clip>(clip: C, frames: Keyframes): C {
  const kept = Object.fromEntries(
    Object.entries(frames).filter(([, list]) => list && list.length > 0),
  ) as Keyframes;
  if (!Object.keys(kept).length) {
    const { keyframes: _gone, ...rest } = clip;
    return rest as C;
  }
  return { ...clip, keyframes: kept };
}

/**
 * Adds a keyframe at a moment for every property of the clip, at the
 * value it shows there, or takes away the one there.
 */
export function toggleKeyframe<C extends Clip>(clip: C, t: number): C {
  const frames: Keyframes = { ...clip.keyframes };
  if (hasKeyframeAt(clip, t)) {
    for (const prop of Object.keys(frames) as KeyProp[]) {
      frames[prop] = framesOf(clip, prop).filter(
        (f) => Math.abs(f.t - t) >= KEYFRAME_EPS,
      );
    }
    return withFrames(clip, frames);
  }
  for (const prop of keyPropsOf(clip)) {
    frames[prop] = withFrame(framesOf(clip, prop), t, valueAt(clip, prop, t));
  }
  return withFrames(clip, frames);
}

/**
 * The clip with values changed at a moment: an animated property takes a
 * keyframe there; one that is not animated changes its own value.
 */
export function withValuesAt<C extends Clip>(
  clip: C,
  values: Partial<Record<KeyProp, number>>,
  t: number,
): C {
  let next = clip;
  const frames: Keyframes = { ...clip.keyframes };
  for (const [prop, v] of Object.entries(values) as [KeyProp, number][]) {
    if (isAnimated(clip, prop))
      frames[prop] = withFrame(framesOf(clip, prop), t, v);
    else next = withBaseValue(next, prop, v);
  }
  return clip.keyframes ? withFrames(next, frames) : next;
}

/** Whether an edit's fields set a property: what the caller changed. */
function touches(updates: Record<string, unknown>, prop: KeyProp): boolean {
  switch (prop) {
    case 'x':
    case 'y':
    case 'scale':
    case 'rotation':
      return 'transform' in updates;
    case 'opacity':
      return 'opacity' in updates || 'style' in updates;
    case 'volume':
      return 'volume' in updates;
    case 'filter':
      return 'filterIntensity' in updates;
    default:
      return 'color' in updates;
  }
}

/**
 * The properties an edit sets to something other than what the clip shows
 * at a moment, and their new values. Only the fields the edit holds count:
 * a trim sets none, and a panel showing the animated values changes only
 * the one moved.
 */
export function changedValues(
  before: Clip,
  updates: Partial<Clip>,
  t: number,
): Partial<Record<KeyProp, number>> {
  const after = { ...before, ...updates } as Clip;
  const fields = updates as Record<string, unknown>;
  const changed: Partial<Record<KeyProp, number>> = {};
  for (const prop of keyPropsOf(after)) {
    if (!touches(fields, prop)) continue;
    const v = baseValue(after, prop);
    if (Math.abs(v - valueAt(before, prop, t)) > 1e-9) changed[prop] = v;
  }
  return changed;
}

/**
 * A clip after an edit made at a moment of itself. On a clip with
 * keyframes, a changed animated value becomes a keyframe there, and the
 * clip's own values of every animated property stay as they were (a panel
 * sends the values it shows at the playhead). Silencing follows a keyed
 * volume, so a volume keyed to 0 does not silence the whole clip.
 */
export function editedAt<C extends Clip>(
  before: C,
  updates: Partial<Clip>,
  t: number,
): C {
  const after = { ...before, ...updates } as C;
  if (!hasKeyframes(before)) return after;
  const changed = changedValues(before, updates, t);
  let kept = after;
  for (const prop of keyPropsOf(before)) {
    if (isAnimated(before, prop)) {
      kept = withBaseValue(kept, prop, baseValue(before, prop));
    }
  }
  if (
    isAnimated(before, 'volume') &&
    'muted' in updates &&
    'volume' in updates
  ) {
    kept = { ...kept, muted: (before as unknown as MediaClip).muted } as C;
  }
  return withValuesAt(kept, changed, t);
}

/** The clip with a keyframe at a moment for each animated property, at its value there. */
export function withEdgeKeyframes<C extends Clip>(clip: C, at: number): C {
  if (!clip.keyframes) return clip;
  const frames: Keyframes = { ...clip.keyframes };
  for (const prop of Object.keys(frames) as KeyProp[]) {
    const list = framesOf(clip, prop);
    if (!list.length || list.some((f) => Math.abs(f.t - at) < KEYFRAME_EPS))
      continue;
    frames[prop] = withFrame(list, at, valueAt(clip, prop, at));
  }
  return { ...clip, keyframes: frames };
}

/**
 * The keyframes of a clip moved by a stretch of its own time and kept
 * within its length: what a trim of its start or end leaves.
 */
export function shiftedKeyframes<C extends Clip>(clip: C, by: number): C {
  if (!clip.keyframes) return clip;
  const frames: Keyframes = {};
  for (const prop of Object.keys(clip.keyframes) as KeyProp[]) {
    frames[prop] = framesOf(clip, prop)
      .map((f) => ({ t: round(f.t + by), v: f.v }))
      .filter(
        (f) => f.t >= -KEYFRAME_EPS && f.t <= clip.duration + KEYFRAME_EPS,
      );
  }
  return withFrames(clip, frames);
}

/** The keyframes of a clip stretched in time, as when its speed changes. */
export function stretchedKeyframes<C extends Clip>(clip: C, factor: number): C {
  if (!clip.keyframes || factor === 1) return clip;
  const frames: Keyframes = {};
  for (const prop of Object.keys(clip.keyframes) as KeyProp[]) {
    frames[prop] = framesOf(clip, prop).map((f) => ({
      t: round(f.t * factor),
      v: f.v,
    }));
  }
  return { ...clip, keyframes: frames };
}

/**
 * The keyframes of the two halves of a clip cut at a moment of itself:
 * each keeps its own, with a keyframe at the cut for every animated
 * property, at its value there.
 */
export function splitKeyframes(
  clip: Clip,
  at: number,
): { first: Keyframes | undefined; second: Keyframes | undefined } {
  if (!clip.keyframes) return { first: undefined, second: undefined };
  const first: Keyframes = {};
  const second: Keyframes = {};
  for (const prop of Object.keys(clip.keyframes) as KeyProp[]) {
    const frames = framesOf(clip, prop);
    if (!frames.length) continue;
    const cut = { v: valueAt(clip, prop, at) };
    first[prop] = [
      ...frames.filter((f) => f.t < at - KEYFRAME_EPS),
      { t: round(at), ...cut },
    ];
    second[prop] = [
      { t: 0, ...cut },
      ...frames
        .filter((f) => f.t > at + KEYFRAME_EPS)
        .map((f) => ({ t: round(f.t - at), v: f.v })),
    ];
  }
  return { first, second };
}

/** The lowest and highest a property reaches over a clip. */
export function rangeOf(clip: Clip, prop: KeyProp): [number, number] {
  const frames = framesOf(clip, prop);
  if (!frames.length) {
    const v = baseValue(clip, prop);
    return [v, v];
  }
  const values = frames.map((f) => f.v);
  return [Math.min(...values), Math.max(...values)];
}

const num = (n: number) => `${Math.round(n * 1e6) / 1e6}`;

/**
 * A property's value as an ffmpeg expression of a time variable (seconds
 * from the clip's start), eased between keyframes as the preview is:
 * v0 + Σ (v[i+1] − v[i]) · ease((T − t[i]) / (t[i+1] − t[i])). Commas are
 * escaped for a quoted filter option. A constant when not animated.
 */
export function keyframeExpr(clip: Clip, prop: KeyProp, time: string): string {
  return framesExpr(framesOf(clip, prop), baseValue(clip, prop), time);
}

/** The same, for any list of keyframes and a value without them. */
export function framesExpr(
  frames: Keyframe[],
  fallback: number,
  time: string,
): string {
  if (!frames.length) return num(fallback);
  const parts = [num(frames[0].v)];
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    const delta = b.v - a.v;
    if (delta === 0) continue;
    const span = Math.max(b.t - a.t, 1e-6);
    const u = `clip((${time}-${num(a.t)})/${num(span)}\\,0\\,1)`;
    parts.push(`${num(delta)}*${u}*${u}*(3-2*${u})`);
  }
  return parts.join('+');
}

/**
 * The same expression mapped through a value-to-amount function that is a
 * straight line over the range: the share, from 0 to 1, of the way between
 * the lowest and highest amounts.
 */
export function shareExpr(
  frames: Keyframe[],
  time: string,
  amountOf: (v: number) => number,
): { expr: string; low: number; high: number } {
  // The amount at each keyframe, eased between as the value is: the amount
  // must change in a straight line with the value for this to be exact.
  const amounts = frames.map((f) => ({ t: f.t, v: amountOf(f.v) }));
  const values = amounts.map((f) => f.v);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  if (span === 0) return { expr: '0', low, high };
  const expr = framesExpr(
    amounts.map((f) => ({ t: f.t, v: (f.v - low) / span })),
    0,
    time,
  );
  return { expr, low, high };
}
