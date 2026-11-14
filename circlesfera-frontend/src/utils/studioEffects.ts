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
  'duotone',
  'kaleidoscope',
];

/** The effects that come with Edits Studio Pro: chosen only with it. */
export const PRO_EFFECTS: ReadonlySet<EffectKind> = new Set([
  'duotone',
  'kaleidoscope',
]);

/**
 * Kaleidoscope: the top left quarter of the picture mirrored into the other
 * three, mixed with the picture by the intensity. The pixel a pixel takes,
 * in a picture of even width and height.
 */
export function kaleidoscopeSource(
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number] {
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  return [x < halfW ? x : 2 * halfW - 1 - x, y < halfH ? y : 2 * halfH - 1 - y];
}

/** The same in ffmpeg: the quarter cropped, flipped and stacked, blended. */
export function kaleidoscopeGraph(tag: string, k: number): string {
  const t = tag;
  return [
    `format=gbrp,split[${t}o][${t}c]`,
    `[${t}c]crop=iw/2:ih/2:0:0,split[${t}q1][${t}q2]`,
    `[${t}q2]hflip[${t}q3]`,
    `[${t}q1][${t}q3]hstack,split[${t}h1][${t}h2]`,
    `[${t}h2]vflip[${t}h3]`,
    `[${t}h1][${t}h3]vstack[${t}m]`,
    `[${t}m][${t}o]blend=all_mode=normal:all_opacity=${k}`,
  ].join(';');
}

/**
 * Duotone: the picture's lightness painted from one colour in the shadows
 * to another in the lights, mixed with the picture by the intensity.
 */
export const DUOTONE_SHADOW = [35, 16, 79] as const;
export const DUOTONE_LIGHT = [255, 122, 92] as const;
const LUMA = [0.299, 0.587, 0.114] as const;

/** One pixel through the duotone at a share k of the way, 0 to 255 each. */
export function duotonePixel(
  r: number,
  g: number,
  b: number,
  k: number,
): [number, number, number] {
  const lum = (LUMA[0] * r + LUMA[1] * g + LUMA[2] * b) / 255;
  const source = [r, g, b];
  return [0, 1, 2].map((c) => {
    const tone =
      DUOTONE_SHADOW[c] + (DUOTONE_LIGHT[c] - DUOTONE_SHADOW[c]) * lum;
    return Math.max(
      0,
      Math.min(255, Math.round(source[c] + k * (tone - source[c]))),
    );
  }) as [number, number, number];
}

/** The same as ffmpeg geq expressions for r, g and b, in RGB. */
export function duotoneGeq(k: number): string {
  const lum = `(${LUMA[0]}*r(X\\,Y)+${LUMA[1]}*g(X\\,Y)+${LUMA[2]}*b(X\\,Y))/255`;
  const plane = (c: 0 | 1 | 2, fn: 'r' | 'g' | 'b') => {
    const source = `${fn}(X\\,Y)`;
    const span = DUOTONE_LIGHT[c] - DUOTONE_SHADOW[c];
    return `${fn}='clip(round(${source}+${k}*(${DUOTONE_SHADOW[c]}+${span}*${lum}-${source}))\\,0\\,255)'`;
  };
  return `format=gbrp,geq=${plane(0, 'r')}:${plane(1, 'g')}:${plane(2, 'b')}`;
}

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
    case 'duotone':
    case 'kaleidoscope':
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
  fps = 30,
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
      // zoompan keeps the picture's size and its centre, frame by frame.
      const { zoom } = a as { zoom: number };
      const frames = Math.max(
        1,
        Math.round(Math.max(clip.duration, 0.01) * fps),
      );
      return `zoompan=z='1+${zoom}*on/${frames}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;
    }
    case 'mono':
      return `hue=s=${round(1 - (a as { amount: number }).amount)}`;
    case 'rgbsplit': {
      const { shift } = a as { shift: number };
      return `rgbashift=rh=${-shift}:bh=${shift}`;
    }
    case 'vignette':
      return `format=rgba[${tag}a];[${tag}a][${mask}]overlay=0:0:format=auto`;
    case 'duotone':
      return duotoneGeq((a as { amount: number }).amount);
    case 'kaleidoscope':
      return kaleidoscopeGraph(tag, (a as { amount: number }).amount);
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
    // The share of the softened picture: all of it at the lowest.
    soften: round(Math.max(0, -at('sharpness'))),
  };
}

/** The colour laid over a picture to warm it (up) or cool it (down). */
export const WARM_COLOR = '#ff9a3c';
export const COOL_COLOR = '#3c8cff';

/**
 * The CSS filter the preview draws a clip's adjustments with: exposure and
 * dimming, contrast and saturation. Lift, warmth, sharpening and softening
 * are laid on separately.
 */
export function colorCssFilter(color: ColorAdjustments): string {
  const a = colorAmounts(color);
  const parts: string[] = [];
  if (a.scale !== 1) parts.push(`brightness(${a.scale})`);
  if (a.contrast !== 1) parts.push(`contrast(${a.contrast})`);
  if (a.saturation !== 1) parts.push(`saturate(${a.saturation})`);
  return parts.join(' ');
}
