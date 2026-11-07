import type {
  BlendMode,
  ChromaKey,
  ClipShape,
  MediaClip,
  StudioProject,
} from '../types/studio';
import { mainTrackOf } from './studioTimeline';

/** The ways a layer mixes with what is under it, in the order shown. */
export const BLEND_MODES: readonly BlendMode[] = [
  'normal',
  'screen',
  'multiply',
  'overlay',
  'lighten',
  'darken',
];

/** The shapes a layer can be cut to, in the order shown. */
export const CLIP_SHAPES: readonly ClipShape[] = [
  'none',
  'circle',
  'rounded',
  'heart',
];

/** The colours of a green and a blue screen. */
export const GREEN_SCREEN = '#00ff00';
export const BLUE_SCREEN = '#0000ff';
/** How strongly and how softly a new green screen takes its colour out. */
export const DEFAULT_CHROMA_STRENGTH = 40;
export const DEFAULT_CHROMA_SOFTNESS = 20;

// How far from the colour is still taken out at full strength, and how wide
// the soft edge is at full softness, as ffmpeg's colorkey measures them.
const MAX_SIMILARITY = 0.5;
const MAX_EDGE = 0.3;

const round = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Whether a clip lies on a layer above the main track. */
export function isOverlayClip(project: StudioProject, clipId: string): boolean {
  const main = mainTrackOf(project);
  return project.tracks.some(
    (t) =>
      t.type === 'video' && t !== main && t.clips.some((c) => c.id === clipId),
  );
}

/** The amounts of a green screen, as ffmpeg's colorkey takes them. */
export function chromaAmounts(chroma: ChromaKey) {
  return {
    similarity: round(clamp01(chroma.strength / 100) * MAX_SIMILARITY),
    edge: round(clamp01(chroma.softness / 100) * MAX_EDGE),
  };
}

/** A #rrggbb colour as its three values. */
export function rgbOf(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return [0, 0, 0];
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** Three values as a #rrggbb colour. */
export function hexOf(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * How much of a pixel a green screen keeps, from 0 to 1: nothing near the
 * colour, all of it far from it, and a soft edge between. The same as
 * ffmpeg's colorkey.
 */
export function chromaKeep(
  r: number,
  g: number,
  b: number,
  key: [number, number, number],
  amounts: { similarity: number; edge: number },
): number {
  const diff = Math.sqrt(
    ((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2) /
      (255 * 255 * 3),
  );
  if (amounts.edge > 0.0001) {
    return clamp01((diff - amounts.similarity) / amounts.edge);
  }
  return diff > amounts.similarity ? 1 : 0;
}

/** The ffmpeg filters of a green screen. */
export function chromaFilter(chroma: ChromaKey): string {
  const { similarity, edge } = chromaAmounts(chroma);
  const hex = chroma.color.replace('#', '0x');
  // colorkey takes a similarity above 0.
  return `format=rgba,colorkey=${hex}:${Math.max(0.00001, similarity)}:${edge}`;
}

// The heart: the points (x, y) where (x² + y² − 1)³ − x²·y³ ≤ 0, scaled so
// it fills a square as wide as the clip's shorter side, and moved down so
// it sits in the middle of it.
const HEART_SCALE = 1.25;
const HEART_SHIFT = 0.12;
const heartAt = (x: number, y: number) =>
  (x * x + y * y - 1) ** 3 - x * x * y * y * y;

/** The corner of a rounded rectangle, as a share of the shorter side. */
export const ROUNDED_CORNER = 0.12;

/**
 * The points of a heart's edge, in shares of half the shorter side, from
 * its centre: found along rays from inside it, as the export tests them.
 */
export function heartOutline(steps = 120): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let inside = 0;
    let outside = 2;
    for (let k = 0; k < 30; k++) {
      const r = (inside + outside) / 2;
      if (heartAt(dx * r, dy * r) <= 0) inside = r;
      else outside = r;
    }
    const hx = dx * inside;
    const hy = dy * inside;
    points.push([hx / HEART_SCALE, -(hy - HEART_SHIFT) / HEART_SCALE]);
  }
  return points;
}

/**
 * Lays out the path of a shape centred in a box of a size: a circle as
 * wide as the box's shorter side, a rectangle with rounded corners, or a
 * heart. The export keeps the same pixels (see shapeAlphaExpr).
 */
export function shapePath(
  ctx: CanvasRenderingContext2D,
  shape: ClipShape,
  width: number,
  height: number,
) {
  const half = Math.min(width, height) / 2;
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(0, 0, half, 0, Math.PI * 2);
      break;
    case 'rounded':
      ctx.roundRect(
        -width / 2,
        -height / 2,
        width,
        height,
        half * 2 * ROUNDED_CORNER,
      );
      break;
    case 'heart':
      heartOutline().forEach(([u, v], i) => {
        if (i === 0) ctx.moveTo(u * half, v * half);
        else ctx.lineTo(u * half, v * half);
      });
      break;
    default:
      ctx.rect(-width / 2, -height / 2, width, height);
  }
  ctx.closePath();
}

/**
 * An ffmpeg expression, in X, Y, W and H, that is 1 inside a shape and 0
 * outside it: the same shape the preview cuts.
 */
export function shapeInsideExpr(shape: ClipShape): string {
  const dx = '(X-W/2)';
  const dy = '(Y-H/2)';
  const half = '(min(W\\,H)/2)';
  switch (shape) {
    case 'circle':
      return `lte(hypot(${dx}\\,${dy})\\,${half})`;
    case 'rounded': {
      const r = `(${half}*${2 * ROUNDED_CORNER})`;
      const ax = `(abs(${dx})-(W/2-${r}))`;
      const ay = `(abs(${dy})-(H/2-${r}))`;
      return `gt(lte(${ax}\\,0)+lte(${ay}\\,0)+lte(hypot(${ax}\\,${ay})\\,${r})\\,0)`;
    }
    case 'heart': {
      const x = `(${dx}/${half}*${HEART_SCALE})`;
      const y = `(-${dy}/${half}*${HEART_SCALE}+${HEART_SHIFT})`;
      return `lte(pow(${x}*${x}+${y}*${y}-1\\,3)-${x}*${x}*${y}*${y}*${y}\\,0)`;
    }
    default:
      return '1';
  }
}

/** The ffmpeg filters that cut a clip to a shape, keeping its own see-through parts. */
export function shapeFilter(shape: ClipShape, tag: string): string {
  return `format=rgba,split[${tag}a][${tag}b];[${tag}b]alphaextract,geq=lum='p(X\\,Y)*${shapeInsideExpr(shape)}'[${tag}c];[${tag}a][${tag}c]alphamerge`;
}

/** The canvas composite operation that draws a blend mode. */
export function compositeOf(
  mode: BlendMode | undefined,
): GlobalCompositeOperation {
  return !mode || mode === 'normal' ? 'source-over' : mode;
}

/** Whether a clip needs drawing on a picture of its own before it is laid. */
export function needsOwnPicture(clip: MediaClip): boolean {
  return Boolean(
    clip.chroma ||
      (clip.shape && clip.shape !== 'none') ||
      (clip.blend && clip.blend !== 'normal'),
  );
}
