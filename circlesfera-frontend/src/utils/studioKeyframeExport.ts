import type { KeyProp, MediaClip, TextClip } from '../types/studio';
import { COOL_COLOR, EFFECT_BASE_WIDTH, WARM_COLOR } from './studioEffects';
import {
  baseValue,
  isAnimated,
  keyframeExpr,
  rangeOf,
  valueAt,
} from './studioKeyframes';

/*
 * The export of keyframes. Every animated value is the same function of
 * time as the preview's (valueAt). Colour changes the picture in
 * proportion to an amount, so an animated one is the picture blended with
 * itself changed at its farthest amount, by a share sent to the blend on
 * every frame: the same as drawing each moment at its own amount, and as
 * cheap as a blend of fixed opacity.
 */

const num = (n: number) => `${Math.round(n * 1e6) / 1e6}`;

/** How far below 0 sharpness softens, in pixels at 1080 wide. */
export const SOFTEN_PX = 3;
// The colour amounts at full strength, as the preview uses them.
const LIFT_AT_FULL = 0.5;
const WARMTH_AT_FULL = 0.35;
const SHARPEN_AT_FULL = 1.5;
// ffmpeg's blend ignores an opacity sent as exactly 1.
const MOST_SHARE = 0.9999;

/** A value sent to a filter on every frame of a clip, in its own time. */
export interface FrameCommand {
  /** The filter's instance name, as filter@name. */
  target: string;
  option: string;
  at: (t: number) => number;
}

/** Filters for a clip, and what they are sent frame by frame. */
export interface Animated {
  filter: string;
  commands: FrameCommand[];
}

const none: Animated = { filter: '', commands: [] };

/** One colour amount: how it follows its slider. */
interface Amount {
  prop: KeyProp;
  of: (v: number) => number;
  /** The amount that leaves the picture as it is. */
  none: number;
}

export const AMOUNTS = {
  dim: {
    prop: 'brightness',
    of: (v) => 1 + (Math.min(0, v) / 100) * 0.5,
    none: 1,
  },
  exposure: { prop: 'exposure', of: (v) => 2 ** (v / 100), none: 1 },
  lift: {
    prop: 'brightness',
    of: (v) => (Math.max(0, v) / 100) * LIFT_AT_FULL,
    none: 0,
  },
  warm: {
    prop: 'warmth',
    of: (v) => (Math.max(0, v) / 100) * WARMTH_AT_FULL,
    none: 0,
  },
  cool: {
    prop: 'warmth',
    of: (v) => (Math.max(0, -v) / 100) * WARMTH_AT_FULL,
    none: 0,
  },
  sharpen: {
    prop: 'sharpness',
    of: (v) => (Math.max(0, v) / 100) * SHARPEN_AT_FULL * 0.25,
    none: 0,
  },
  soften: { prop: 'sharpness', of: (v) => Math.max(0, -v) / 100, none: 0 },
  filter: {
    prop: 'filter',
    of: (v) => Math.max(0, Math.min(100, v)) / 100,
    none: 0,
  },
} satisfies Record<string, Amount>;

/**
 * The sides an animated amount reaches past leaving the picture as it
 * is: its farthest each way, and the share of the way there at a moment.
 */
export function sidesOf(
  clip: MediaClip,
  amount: Amount,
): { far: number; share: (t: number) => number }[] {
  const [low, high] = rangeOf(clip, amount.prop);
  const ends = [amount.of(low), amount.of(high)];
  const most = Math.max(...ends);
  const least = Math.min(...ends);
  const sides: { far: number; share: (t: number) => number }[] = [];
  for (const far of [most, least]) {
    if (far === amount.none) continue;
    if (sides.some((s) => s.far === far)) continue;
    sides.push({
      far,
      share: (t) => {
        const share =
          (amount.of(valueAt(clip, amount.prop, t)) - amount.none) /
          (far - amount.none);
        return Math.max(0, Math.min(MOST_SHARE, share));
      },
    });
  }
  return sides;
}

const lut = (value: string) => `lutrgb=r='${value}':g='${value}':b='${value}'`;

/**
 * A change that grows from nothing with its amount: drawn at its own
 * amount when that does not change, or drawn at its farthest each way and
 * blended in by a share sent on every frame.
 */
function grown(
  clip: MediaClip,
  amount: Amount,
  tag: string,
  draw: (at: number) => string,
  /** Whether the amount is a share of a change drawn always at its fullest. */
  share = false,
): Animated {
  if (!isAnimated(clip, amount.prop)) {
    const at = amount.of(baseValue(clip, amount.prop));
    if (at === amount.none) return none;
    if (!share) return { filter: draw(at), commands: [] };
    return {
      filter: `split[${tag}p][${tag}q];[${tag}q]${draw(1)}[${tag}r];[${tag}r][${tag}p]blend=all_mode=normal:all_opacity=${num(Math.min(MOST_SHARE, at))}`,
      commands: [],
    };
  }
  const filters: string[] = [];
  const commands: FrameCommand[] = [];
  sidesOf(clip, amount).forEach((side, i) => {
    const name = `${tag}${i}`;
    // In ffmpeg's normal blend the opacity is the share of the top input.
    filters.push(
      `split[${name}p][${name}q];[${name}q]${draw(side.far)}[${name}r];[${name}r][${name}p]blend@${name}=all_mode=normal:all_opacity=${num(side.share(0))}`,
    );
    commands.push({
      target: `blend@${name}`,
      option: 'all_opacity',
      at: side.share,
    });
  });
  return { filter: filters.join(','), commands };
}

const joined = (parts: Animated[]): Animated => ({
  filter: parts
    .map((p) => p.filter)
    .filter(Boolean)
    .join(','),
  commands: parts.flatMap((p) => p.commands),
});

/** Contrast for a slider value: up to double, down to half. */
export function contrastOf(v: number): number {
  return 1 + (v / 100) * (v > 0 ? 1 : 0.5);
}

/**
 * The colour of a clip drawn before its colour filter, as the preview's
 * CSS filter draws it: dimming, exposure, contrast, saturation, and
 * softening, each following its keyframes.
 */
export function colorBefore(
  clip: MediaClip,
  width: number,
  tag: string,
): Animated {
  const scaleBy = (k: number) => lut(`clip(val*${num(k)}\\,0\\,255)`);
  const parts = [
    grown(clip, AMOUNTS.dim, `${tag}d`, scaleBy),
    grown(clip, AMOUNTS.exposure, `${tag}e`, scaleBy),
  ];
  const animated =
    isAnimated(clip, 'contrast') || isAnimated(clip, 'saturation');
  // eq works its expressions out once a frame: cheap.
  const contrast = isAnimated(clip, 'contrast')
    ? `'1+(${keyframeExpr(clip, 'contrast', 't')})/100*if(gt(${keyframeExpr(clip, 'contrast', 't')}\\,0)\\,1\\,0.5)'`
    : num(contrastOf(baseValue(clip, 'contrast')));
  const saturation = isAnimated(clip, 'saturation')
    ? `'1+(${keyframeExpr(clip, 'saturation', 't')})/100'`
    : num(1 + baseValue(clip, 'saturation') / 100);
  if (animated || contrast !== '1' || saturation !== '1') {
    parts.push({
      filter: `eq=contrast=${contrast}:saturation=${saturation}${animated ? ':eval=frame' : ''}`,
      commands: [],
    });
  }
  const px = width / EFFECT_BASE_WIDTH;
  parts.push(
    grown(
      clip,
      AMOUNTS.soften,
      `${tag}s`,
      () => `gblur=sigma=${num(SOFTEN_PX * px)}`,
      true,
    ),
  );
  const all = joined(parts);
  return all.filter ? { ...all, filter: `format=rgba,${all.filter}` } : none;
}

/** A clip's colour filter at its intensity, following its keyframes. */
export function filterAt(
  clip: MediaClip,
  cssFx: string,
  tag: string,
): Animated {
  if (!cssFx) return none;
  if (!isAnimated(clip, 'filter')) {
    const share = AMOUNTS.filter.of(baseValue(clip, 'filter'));
    if (share <= 0) return none;
    if (share >= 1) return { filter: cssFx, commands: [] };
  }
  const part = grown(clip, AMOUNTS.filter, tag, () => `${cssFx},format=rgba`);
  if (!isAnimated(clip, 'filter')) {
    // At a fixed share: the filtered picture over the plain one.
    const share = AMOUNTS.filter.of(baseValue(clip, 'filter'));
    return {
      filter: `format=rgba,split[${tag}a][${tag}b];[${tag}b]${cssFx},format=rgba[${tag}c];[${tag}c][${tag}a]blend=all_mode=normal:all_opacity=${num(share)}`,
      commands: [],
    };
  }
  return { ...part, filter: `format=rgba,${part.filter}` };
}

/**
 * The colour of a clip laid on after its colour filter, as the preview
 * lays it: lift, warmth and sharpening, each following its keyframes,
 * worked in RGB with the clip's see-through parts kept.
 */
export function colorAfter(clip: MediaClip, tag: string): Animated {
  const parts: Animated[] = [
    grown(clip, AMOUNTS.lift, `${tag}l`, (at) =>
      lut(`clip(val+${Math.round(at * 255)}\\,0\\,255)`),
    ),
  ];
  for (const [name, amount, color] of [
    ['w', AMOUNTS.warm, WARM_COLOR],
    ['k', AMOUNTS.cool, COOL_COLOR],
  ] as const) {
    const hex = color.replace('#', '0x');
    const id = `${tag}${name}`;
    const soft = (at: number) =>
      `split[${id}x][${id}y];[${id}y]drawbox=c=${hex}@1:t=fill[${id}z];[${id}x][${id}z]blend@${id}=all_mode=softlight:all_opacity=${num(at)}`;
    if (!isAnimated(clip, amount.prop)) {
      const at = amount.of(baseValue(clip, amount.prop));
      if (at > 0) parts.push({ filter: soft(at), commands: [] });
      continue;
    }
    // Soft light grows straight with its opacity: send that each frame.
    const [low, high] = rangeOf(clip, amount.prop);
    if (Math.max(amount.of(low), amount.of(high)) <= 0) continue;
    parts.push({
      filter: soft(amount.of(valueAt(clip, amount.prop, 0))),
      commands: [
        {
          target: `blend@${id}`,
          option: 'all_opacity',
          at: (t) =>
            Math.min(MOST_SHARE, amount.of(valueAt(clip, amount.prop, t))),
        },
      ],
    });
  }
  parts.push(
    grown(clip, AMOUNTS.sharpen, `${tag}h`, (n) => {
      const m = `0 -${num(n)} 0 -${num(n)} ${num(1 + 4 * n)} -${num(n)} 0 -${num(n)} 0`;
      return `convolution=0m='${m}':1m='${m}':2m='${m}'`;
    }),
  );
  const all = joined(parts);
  if (!all.filter) return none;
  return {
    filter: `format=rgba,split[${tag}a][${tag}b];[${tag}b]alphaextract[${tag}c];[${tag}a]format=gbrp,${all.filter},format=rgba[${tag}d];[${tag}d][${tag}c]alphamerge`,
    commands: all.commands,
  };
}

/**
 * The size of a clip that changes in time: drawn at its fitted size, then
 * grown by its keyframes on a clear frame as large as its largest, so the
 * frame laid over the video keeps one size.
 */
export function animatedScale(
  clip: MediaClip | TextClip,
  fitW: number,
  fitH: number,
): string {
  const [, most] = rangeOf(clip, 'scale');
  const even = (n: number) => Math.max(2, Math.ceil(n / 2) * 2);
  const s = keyframeExpr(clip, 'scale', 't');
  return `format=rgba,scale=w='max(1\\,iw*(${s}))':h='max(1\\,ih*(${s}))':eval=frame,pad=w=${even(fitW * most)}:h=${even(fitH * most)}:x='(ow-iw)/2':y='(oh-ih)/2':color=black@0:eval=frame`;
}

/** A turn that changes in time, on a frame that keeps one size. */
export function animatedRotation(clip: MediaClip): string {
  return `rotate=a='(${keyframeExpr(clip, 'rotation', 't')})*PI/180':ow='hypot(iw\\,ih)':oh=ow:c=none`;
}

/** Opacity that changes in time: the clip's alpha scaled by a value sent each frame. */
export function animatedOpacity(clip: MediaClip, tag: string): Animated {
  const at = (t: number) =>
    Math.max(0, Math.min(1, valueAt(clip, 'opacity', t)));
  return {
    filter: `format=rgba,colorchannelmixer@${tag}=aa=${num(at(0))}`,
    commands: [{ target: `colorchannelmixer@${tag}`, option: 'aa', at }],
  };
}

/** A place on the frame, moved by its keyframes: the moves in export pixels. */
export function placeExpr(
  clip: MediaClip | TextClip,
  prop: 'x' | 'y',
  time: string,
  k: number,
): string {
  if (!isAnimated(clip, prop)) return num(baseValue(clip, prop) * k);
  return `(${keyframeExpr(clip, prop, time)})*${num(k)}`;
}

/**
 * The commands of a clip for ffmpeg's sendcmd, one line a frame over its
 * length, in its own time.
 */
export function commandScript(
  commands: FrameCommand[],
  duration: number,
  fps: number,
): string {
  if (!commands.length) return '';
  const frames = Math.max(1, Math.ceil(duration * fps));
  const lines: string[] = [];
  for (let n = 0; n <= frames; n++) {
    const t = n / fps;
    lines.push(
      `${num(t)} ${commands.map((c) => `${c.target} ${c.option} ${num(c.at(t))}`).join(', ')};`,
    );
  }
  return lines.join('\n');
}
