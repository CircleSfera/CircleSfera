import type { EffectClip, TransitionKind } from '../types/studio';
import {
  COOL_COLOR,
  effectAmounts,
  shakeAt,
  VIGNETTE_STOPS,
  vignetteDarkAt,
  WARM_COLOR,
} from './studioEffects';
import { chromaKeep } from './studioOverlay';

/*
 * How the preview draws transitions and effects on its canvas, matching
 * what the export's ffmpeg filters draw.
 */

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// How much of the outgoing and the incoming clip a fade through black
// shows, every twentieth of the way, as ffmpeg's xfade draws it.
const FADEBLACK_OUT = [1, 0.78, 0.4, 0.06];
const FADEBLACK_IN = [
  0, 0, 0, 0, 0, 0, 0.02, 0.07, 0.13, 0.2, 0.29, 0.37, 0.46, 0.55, 0.64, 0.71,
  0.78, 0.83, 0.88, 0.94, 1,
];

/** A value of a table taken every twentieth of the way, at a share of it. */
export function sampled(table: readonly number[], p: number): number {
  const at = Math.max(0, Math.min(1, p)) * 20;
  const i = Math.floor(at);
  const a = table[i] ?? 0;
  const b = table[i + 1] ?? (i + 1 < 21 ? 0 : a);
  return a + (b - a) * (at - i);
}

/** How much of each clip a transition shows at a share of its way. */
export function transitionWeights(
  kind: TransitionKind,
  p: number,
): { out: number; in: number } {
  switch (kind) {
    case 'fadeblack':
      return {
        out: sampled(FADEBLACK_OUT, p),
        in: sampled(FADEBLACK_IN, p),
      };
    case 'zoomin': {
      const into = smoothstep(0.5, 1, p);
      return { out: 1 - into, in: into };
    }
    default:
      return { out: 1 - p, in: p };
  }
}

/**
 * Draws the moment of a transition between the outgoing picture and the
 * incoming one, each the size of the canvas, at a share of its way.
 */
export function drawTransition(
  ctx: CanvasRenderingContext2D,
  from: CanvasImageSource,
  to: CanvasImageSource,
  kind: TransitionKind,
  p: number,
  width: number,
  height: number,
) {
  ctx.save();
  switch (kind) {
    case 'slideleft':
    case 'slideright':
    case 'slideup':
    case 'slidedown': {
      const horizontal = kind === 'slideleft' || kind === 'slideright';
      const sign = kind === 'slideleft' || kind === 'slideup' ? -1 : 1;
      const size = horizontal ? width : height;
      const shift = sign * p * size;
      const [dx, dy] = horizontal ? [shift, 0] : [0, shift];
      ctx.drawImage(from, dx, dy, width, height);
      ctx.drawImage(
        to,
        dx - (horizontal ? sign * width : 0),
        dy - (horizontal ? 0 : sign * height),
        width,
        height,
      );
      break;
    }
    case 'zoomin': {
      const w = transitionWeights(kind, p);
      const zf = Math.max(0.01, 1 - smoothstep(0, 0.5, p));
      ctx.drawImage(to, 0, 0, width, height);
      ctx.globalAlpha = w.out;
      ctx.translate(width / 2, height / 2);
      ctx.scale(1 / zf, 1 / zf);
      ctx.drawImage(from, -width / 2, -height / 2, width, height);
      break;
    }
    case 'blur': {
      // A crossfade smeared sideways, most at the middle of the way.
      const spread = (width / 2) * (1 - Math.abs(2 * p - 1));
      const taps = spread < 1 ? 1 : 8;
      for (const [source, weight] of [
        [from, 1 - p],
        [to, p],
      ] as const) {
        for (let i = 0; i < taps; i++) {
          const dx = taps === 1 ? 0 : (i / (taps - 1) - 0.5) * spread;
          ctx.globalAlpha = weight / taps;
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(source, dx, 0, width, height);
        }
      }
      break;
    }
    default: {
      // Crossfade and fade through black: each picture at its share, over
      // black.
      const w = transitionWeights(kind, p);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = w.out;
      ctx.drawImage(from, 0, 0, width, height);
      ctx.globalAlpha = w.in;
      ctx.drawImage(to, 0, 0, width, height);
    }
  }
  ctx.restore();
}

/** A canvas of a size, kept to be drawn on again. */
export function scratchCanvas(
  cache: { current: HTMLCanvasElement | null },
  width: number,
  height: number,
): HTMLCanvasElement {
  let canvas = cache.current;
  if (!canvas) {
    canvas = document.createElement('canvas');
    cache.current = canvas;
  }
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return canvas;
}

// Copies what the canvas shows, so it can be drawn back changed.
function snapshot(
  canvas: HTMLCanvasElement,
  copy: HTMLCanvasElement,
): HTMLCanvasElement {
  const c = copy.getContext('2d');
  c?.clearRect(0, 0, copy.width, copy.height);
  c?.drawImage(canvas, 0, 0);
  return copy;
}

/** Lifts every value of a picture by a share of white, only where it shows. */
export function liftPicture(
  picture: HTMLCanvasElement,
  copy: HTMLCanvasElement,
  lift: number,
) {
  const ctx = picture.getContext('2d');
  if (!ctx || lift <= 0) return;
  snapshot(picture, copy);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = lift;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, picture.width, picture.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(copy, 0, 0);
  ctx.restore();
}

/** Lays orange or blue over a picture in soft light, only where it shows. */
export function warmPicture(
  picture: HTMLCanvasElement,
  copy: HTMLCanvasElement,
  warmth: number,
) {
  const ctx = picture.getContext('2d');
  if (!ctx || warmth === 0) return;
  snapshot(picture, copy);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = Math.abs(warmth);
  ctx.fillStyle = warmth > 0 ? WARM_COLOR : COOL_COLOR;
  ctx.fillRect(0, 0, picture.width, picture.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(copy, 0, 0);
  ctx.restore();
}

/**
 * Sharpens a picture with the 3×3 kernel the export uses. It reads every
 * pixel, so the preview does it only on a still frame.
 */
export function sharpenPicture(picture: HTMLCanvasElement, amount: number) {
  const ctx = picture.getContext('2d');
  if (!ctx || amount <= 0) return;
  const { width, height } = picture;
  let image: ImageData;
  try {
    image = ctx.getImageData(0, 0, width, height);
  } catch {
    // A file the browser will not let the page read stays as it is here;
    // the export still sharpens it.
    return;
  }
  const src = new Uint8ClampedArray(image.data);
  const out = image.data;
  const a = sharpenWeight(amount);
  const centre = 1 + 4 * a;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        out[i + ch] =
          centre * src[i + ch] -
          a *
            (src[i + ch - 4] +
              src[i + ch + 4] +
              src[i + ch - width * 4] +
              src[i + ch + width * 4]);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** The weight of the neighbours in the sharpening kernel. */
export function sharpenWeight(amount: number): number {
  return Math.round(amount * 0.25 * 1000) / 1000;
}

// Fresh grain for each frame, small and repeated over the picture.
const GRAIN_TILE = 128;
function grainTile(copy: HTMLCanvasElement, strength: number) {
  copy.width = GRAIN_TILE;
  copy.height = GRAIN_TILE;
  const c = copy.getContext('2d');
  if (!c) return null;
  const image = c.createImageData(GRAIN_TILE, GRAIN_TILE);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 128 + (Math.random() * 2 - 1) * strength * 2;
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  c.putImageData(image, 0, 0);
  return c.createPattern(copy, 'repeat');
}

/**
 * Draws an effect over what the canvas shows, at a moment of its own time
 * (0 at its start).
 */
export function drawEffect(
  canvas: HTMLCanvasElement,
  copyCanvas: HTMLCanvasElement,
  clip: EffectClip,
  t: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  const a = effectAmounts(clip.effect, clip.intensity, width);
  ctx.save();
  switch (clip.effect) {
    case 'vignette':
      drawVignette(ctx, width, height, a.dark);
      break;
    case 'grain': {
      const pattern = grainTile(document.createElement('canvas'), a.strength);
      if (pattern) {
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, width, height);
      }
      break;
    }
    case 'rgbsplit': {
      const copy = snapshot(canvas, copyCanvas);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      const channel = document.createElement('canvas');
      channel.width = width;
      channel.height = height;
      const c = channel.getContext('2d');
      if (!c) break;
      for (const [color, dx] of [
        ['#f00', -a.shift],
        ['#0f0', 0],
        ['#00f', a.shift],
      ] as const) {
        c.globalCompositeOperation = 'source-over';
        c.clearRect(0, 0, width, height);
        c.drawImage(copy, dx, 0);
        c.globalCompositeOperation = 'multiply';
        c.fillStyle = color;
        c.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(channel, 0, 0);
      }
      break;
    }
    default: {
      // The effects that redraw the whole picture changed.
      const copy = snapshot(canvas, copyCanvas);
      if (clip.effect === 'glow') {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = a.opacity;
        ctx.filter = `blur(${a.radius}px)`;
        ctx.drawImage(copy, 0, 0);
        break;
      }
      ctx.clearRect(0, 0, width, height);
      if (clip.effect === 'blur') ctx.filter = `blur(${a.radius}px)`;
      if (clip.effect === 'mono') ctx.filter = `grayscale(${a.amount})`;
      if (clip.effect === 'shake') {
        const grow = 1 + (2 * a.offset) / Math.min(width, height);
        const at = shakeAt(a.offset, t);
        ctx.translate(width / 2 - at.x, height / 2 - at.y);
        ctx.scale(grow, grow);
        ctx.translate(-width / 2, -height / 2);
      }
      if (clip.effect === 'slowzoom') {
        const zoom = 1 + a.zoom * (t / Math.max(clip.duration, 0.01));
        ctx.translate(width / 2, height / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-width / 2, -height / 2);
      }
      ctx.drawImage(copy, 0, 0);
    }
  }
  ctx.restore();
}

/**
 * The darkening of a vignette as a picture, for the export to lay over the
 * video: the same gradient the preview draws.
 */
export async function vignetteMaskPng(
  width: number,
  height: number,
  dark: number,
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawVignette(canvas.getContext('2d'), width, height, dark);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('vignette mask');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Darkens a picture from none at the centre to the most at the corners. */
export function drawVignette(
  ctx: CanvasRenderingContext2D | null,
  width: number,
  height: number,
  dark: number,
) {
  if (!ctx) return;
  const reach = Math.hypot(width / 2, height / 2);
  const g = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    reach,
  );
  for (const stop of VIGNETTE_STOPS) {
    g.addColorStop(stop, `rgba(0,0,0,${vignetteDarkAt(dark, stop)})`);
  }
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Takes a green screen's colour out of a stretch of a picture: each pixel
 * keeps the share the export's colorkey keeps of it.
 */
export function keyPicture(
  picture: HTMLCanvasElement,
  box: { x: number; y: number; w: number; h: number },
  key: [number, number, number],
  amounts: { similarity: number; edge: number },
) {
  const ctx = picture.getContext('2d');
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(picture.width, Math.ceil(box.x + box.w)) - x;
  const h = Math.min(picture.height, Math.ceil(box.y + box.h)) - y;
  if (!ctx || w <= 0 || h <= 0) return;
  let image: ImageData;
  try {
    image = ctx.getImageData(x, y, w, h);
  } catch {
    // A file the page may not read is shown as it is; the export keys it.
    return;
  }
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i + 3] = Math.round(
      d[i + 3] * chromaKeep(d[i], d[i + 1], d[i + 2], key, amounts),
    );
  }
  ctx.putImageData(image, x, y);
}
