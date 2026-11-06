import type {
  ColorAdjustments,
  EffectClip,
  EffectKind,
  StudioProject,
} from '../types/studio';

/** The effects of the effects layer, in the order shown. */
export const EFFECT_KINDS: readonly EffectKind[] = [
  'blur',
  'vignette',
  'grain',
  'shake',
  'slowzoom',
  'mono',
  'glow',
  'rgbsplit',
];

/** How long a new effect lasts, in seconds, when the video has that much left. */
export const EFFECT_CLIP_SEC = 3;
/** How strong a new effect is, from 0 to 100. */
export const DEFAULT_EFFECT_INTENSITY = 50;

/** The picture adjustments, in the order shown. */
export const COLOR_KEYS: readonly (keyof ColorAdjustments)[] = [
  'brightness',
  'contrast',
  'saturation',
  'warmth',
  'exposure',
  'sharpness',
];
/** The furthest an adjustment goes either way. */
export const COLOR_LIMIT = 100;

/**
 * Sizes in an effect are given for a picture 1080 pixels wide and grow or
 * shrink with the picture, so the preview and the export match.
 */
export const EFFECT_BASE_WIDTH = 1080;

// The values each effect reaches at full intensity.
const BLUR_PX = 20;
const GLOW_BLUR_PX = 12;
const GRAIN_STRENGTH = 40;
const SHAKE_SHARE = 0.03;
const SHAKE_HZ_X = 7;
const SHAKE_HZ_Y = 5;
const SLOW_ZOOM_SHARE = 0.3;
const RGB_SPLIT_SHARE = 0.02;
const VIGNETTE_DARK = 0.85;
const WARMTH_ALPHA = 0.35;
const SHARPEN_AMOUNT = 1.5;

const share = (intensity: number) =>
  Math.max(0, Math.min(100, intensity)) / 100;
const round = (n: number) => Math.round(n * 1000) / 1000;

/** The clips of the effects layers that are shown, in the order they apply. */
export function effectClipsOf(project: StudioProject): EffectClip[] {
  return project.tracks
    .filter((t) => t.type === 'effect' && !t.hidden)
    .flatMap((t) => t.clips)
    .filter((c): c is EffectClip => c.type === 'effect');
}

/** The amounts an effect works with at an intensity and a picture width. */
export function effectAmounts(
  effect: EffectKind,
  intensity: number,
  width: number,
): Record<string, number> {
  const k = share(intensity);
  const px = width / EFFECT_BASE_WIDTH;
  switch (effect) {
    case 'blur':
      return { radius: round(k * BLUR_PX * px) };
    case 'glow':
      return { radius: round(GLOW_BLUR_PX * px), opacity: round(k) };
    case 'grain':
      return { strength: Math.round(k * GRAIN_STRENGTH) };
    case 'shake':
      return { offset: round(k * SHAKE_SHARE * width) };
    case 'slowzoom':
      return { zoom: round(k * SLOW_ZOOM_SHARE) };
    case 'rgbsplit':
      return { shift: Math.round(k * RGB_SPLIT_SHARE * width) };
    case 'vignette':
      return { dark: round(k * VIGNETTE_DARK) };
    case 'mono':
      return { amount: round(k) };
  }
}

/** Where a shaking picture is moved to at a moment, in pixels. */
export function shakeAt(offset: number, t: number): { x: number; y: number } {
  return {
    x: offset * Math.sin(2 * Math.PI * SHAKE_HZ_X * t),
    y: offset * Math.cos(2 * Math.PI * SHAKE_HZ_Y * t),
  };
}

/**
 * The ffmpeg filters that draw an effect over a stretch, its own time
 * starting at 0. Each keeps the size of the picture. `tag` keeps the names
 * of its inner links apart from those of other effects; a vignette lays
 * over the picture the mask named `mask`, drawn as the preview draws it.
 */
export function effectFilter(
  clip: EffectClip,
  width: number,
  height: number,
  tag: string,
  mask?: string,
): string {
  const a = effectAmounts(clip.effect, clip.intensity, width);
  switch (clip.effect) {
    case 'blur':
      return `gblur=sigma=${(a as { radius: number }).radius}`;
    case 'glow': {
      const { radius, opacity } = a as { radius: number; opacity: number };
      // Blended in RGB: in YUV a screen tints the colour planes.
      return `format=gbrp,split[${tag}a][${tag}b];[${tag}b]gblur=sigma=${radius}[${tag}c];[${tag}a][${tag}c]blend=all_mode=screen:all_opacity=${opacity}`;
    }
    case 'grain':
      return `noise=alls=${(a as { strength: number }).strength}:allf=t`;
    case 'shake': {
      const { offset } = a as { offset: number };
      const grow = round(1 + (2 * offset) / Math.min(width, height));
      return [
        `scale=w=ceil(iw*${grow}/2)*2:h=ceil(ih*${grow}/2)*2`,
        `crop=w=${width}:h=${height}:x=(iw-${width})/2+${offset}*sin(2*PI*${SHAKE_HZ_X}*t):y=(ih-${height})/2+${offset}*cos(2*PI*${SHAKE_HZ_Y}*t)`,
      ].join(',');
    }
    case 'slowzoom': {
      const { zoom } = a as { zoom: number };
      const length = Math.max(clip.duration, 0.01);
      return [
        `scale=w=ceil(iw*(1+${zoom}*t/${length})/2)*2:h=ceil(ih*(1+${zoom}*t/${length})/2)*2:eval=frame`,
        `crop=w=${width}:h=${height}:x=(iw-${width})/2:y=(ih-${height})/2`,
      ].join(',');
    }
    case 'mono':
      return `hue=s=${round(1 - (a as { amount: number }).amount)}`;
    case 'rgbsplit': {
      const { shift } = a as { shift: number };
      return `rgbashift=rh=${-shift}:bh=${shift}`;
    }
    case 'vignette':
      return `format=rgba[${tag}a];[${tag}a][${mask}]overlay=0:0:format=auto`;
  }
}

/**
 * How dark a vignette is at a share of the way from the centre to a
 * corner: none at the centre, its full amount at the corners.
 */
export function vignetteDarkAt(dark: number, reach: number): number {
  return round(dark * reach * reach);
}

/** The stops of a vignette's gradient, from the centre out. */
export const VIGNETTE_STOPS = [0, 0.25, 0.5, 0.75, 1] as const;

/** A picture's adjustments, or none when every one is 0. */
export function activeColor(
  color: ColorAdjustments | undefined,
): ColorAdjustments | null {
  if (!color) return null;
  return COLOR_KEYS.some((key) => color[key] !== 0) ? color : null;
}

/** Adjustments at 0, to start from. */
export const NO_COLOR: ColorAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  exposure: 0,
  sharpness: 0,
};

/**
 * How much each adjustment changes the picture, the same for the preview
 * and the export:
 * - brightness lifts every value (up) or scales it down (down);
 * - exposure multiplies every value by a power of two, one stop each way;
 * - contrast and saturation scale around the middle grey and the grey;
 * - warmth lays orange (up) or blue (down) over the picture in soft light;
 * - sharpness sharpens (up) or blurs (down).
 */
export function colorAmounts(color: ColorAdjustments) {
  const at = (key: keyof ColorAdjustments) =>
    Math.max(-COLOR_LIMIT, Math.min(COLOR_LIMIT, color[key])) / COLOR_LIMIT;
  const b = at('brightness');
  return {
    lift: round(Math.max(0, b) * 0.5),
    scale: round((1 + Math.min(0, b) * 0.5) * 2 ** at('exposure')),
    contrast: round(1 + at('contrast') * (at('contrast') > 0 ? 1 : 0.5)),
    saturation: round(1 + at('saturation')),
    warmth: round(at('warmth') * WARMTH_ALPHA),
    sharpen: round(Math.max(0, at('sharpness')) * SHARPEN_AMOUNT),
    soften: round(Math.max(0, -at('sharpness')) * 3),
  };
}

/** The colour laid over a picture to warm it (up) or cool it (down). */
export const WARM_COLOR = '#ff9a3c';
export const COOL_COLOR = '#3c8cff';

/** The ffmpeg filters of a clip's adjustments, for a picture of a width. */
export function colorFilter(
  color: ColorAdjustments,
  width: number,
  tag: string,
): string {
  const a = colorAmounts(color);
  const px = width / EFFECT_BASE_WIDTH;
  const parts: string[] = [];
  const lut = (value: string) =>
    `lutrgb=r='${value}':g='${value}':b='${value}'`;
  // In the order the preview draws them: its CSS filter scales, then
  // changes contrast and saturation; the lift is laid on after.
  if (a.scale !== 1) parts.push(lut(`clip(val*${a.scale}\\,0\\,255)`));
  if (a.contrast !== 1 || a.saturation !== 1) {
    parts.push(`eq=contrast=${a.contrast}:saturation=${a.saturation}`);
  }
  if (a.lift > 0) {
    parts.push(lut(`clip(val+${Math.round(a.lift * 255)}\\,0\\,255)`));
  }
  if (a.warmth !== 0) {
    const hex = (a.warmth > 0 ? WARM_COLOR : COOL_COLOR).replace('#', '0x');
    parts.push(
      `format=gbrp,split[${tag}a][${tag}b];[${tag}b]drawbox=c=${hex}@1:t=fill[${tag}c];[${tag}a][${tag}c]blend=all_mode=softlight:all_opacity=${Math.abs(a.warmth)}`,
    );
  }
  if (a.sharpen > 0) {
    // The same 3×3 kernel the preview sharpens a still frame with.
    const n = round(a.sharpen * 0.25);
    const m = `0 -${n} 0 -${n} ${round(1 + 4 * n)} -${n} 0 -${n} 0`;
    parts.push(`format=gbrp,convolution=0m='${m}':1m='${m}':2m='${m}'`);
  }
  if (a.soften > 0) parts.push(`gblur=sigma=${round(a.soften * px)}`);
  return parts.join(',');
}

/** The CSS filter the preview draws a clip's adjustments with, but warmth and sharpening. */
export function colorCssFilter(color: ColorAdjustments, width: number): string {
  const a = colorAmounts(color);
  const px = width / EFFECT_BASE_WIDTH;
  const parts: string[] = [];
  if (a.scale !== 1) parts.push(`brightness(${a.scale})`);
  if (a.contrast !== 1) parts.push(`contrast(${a.contrast})`);
  if (a.saturation !== 1) parts.push(`saturate(${a.saturation})`);
  if (a.soften > 0) parts.push(`blur(${round(a.soften * px)}px)`);
  return parts.join(' ');
}
