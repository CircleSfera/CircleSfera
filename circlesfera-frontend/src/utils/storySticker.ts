/**
 * Where a poll or a question sits on a story, so viewers answer it there.
 * The centre is a share of the story's width and height from its middle; the
 * ranges match what the server accepts.
 */
export interface StickerPlacement {
  x: number;
  y: number;
  scale: number;
  /** Degrees. */
  rotation: number;
}

/** A poll or a question as the story feed sends it. */
export interface StoryStickerRef {
  id: string;
  stickerX?: number | null;
  stickerY?: number | null;
  stickerScale?: number | null;
  stickerRotation?: number | null;
}

/** Width of a sticker at scale 1, as a share of the story's width. */
export const STICKER_WIDTH_PCT = 82;
export const STICKER_MIN_SCALE = 0.5;
export const STICKER_MAX_SCALE = 1.35;

/** A story is upright, 9:16. */
export const STORY_RATIO = 9 / 16;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** An angle in degrees, turned into (-180, 180]. */
export function normalizeDegrees(deg: number): number {
  const turned = ((((deg + 180) % 360) + 360) % 360) - 180;
  return turned === -180 ? 180 : turned;
}

/**
 * The place of a sticker of the composer, whose position is in pixels from
 * the centre of a canvas of the given size.
 */
export function placementFromElement(
  el: { x: number; y: number; scale: number; rotation: number },
  canvas: { width: number; height: number },
): StickerPlacement | undefined {
  if (!(canvas.width > 0 && canvas.height > 0)) return undefined;
  return {
    x: clamp(el.x / canvas.width, -0.5, 0.5),
    y: clamp(el.y / canvas.height, -0.5, 0.5),
    scale: clamp(el.scale, STICKER_MIN_SCALE, STICKER_MAX_SCALE),
    rotation: normalizeDegrees(el.rotation),
  };
}

/** The place the creator gave, or null for a story that has none. */
export function placementOf(
  sticker: StoryStickerRef | null | undefined,
): StickerPlacement | null {
  if (
    !sticker ||
    sticker.stickerX == null ||
    sticker.stickerY == null ||
    sticker.stickerScale == null ||
    sticker.stickerRotation == null
  ) {
    return null;
  }
  return {
    x: sticker.stickerX,
    y: sticker.stickerY,
    scale: sticker.stickerScale,
    rotation: sticker.stickerRotation,
  };
}

/**
 * The box the story picture fills when it covers an area of the given size:
 * as wide or as tall as the area, cut at the other sides, as `object-cover`.
 */
export function coverBox(area: { width: number; height: number }): {
  width: number;
  height: number;
} {
  if (!(area.width > 0 && area.height > 0)) return { width: 0, height: 0 };
  if (area.width / area.height < STORY_RATIO) {
    return { width: area.height * STORY_RATIO, height: area.height };
  }
  return { width: area.width, height: area.width / STORY_RATIO };
}

/** Space kept between a sticker and the edge of the screen. */
const SCREEN_MARGIN = 8;

/**
 * Where a sticker goes on a screen of the given size, in pixels: its centre
 * and its width before its scale. The place is taken on the story picture as
 * it covers the screen; a sticker that would run past a side, where a tall
 * phone cuts the picture, is moved in until it fits, and one too wide for
 * the screen is narrowed.
 */
export function stickerOnScreen(
  placement: StickerPlacement,
  area: { width: number; height: number },
): { left: number; top: number; width: number } {
  const box = coverBox(area);
  if (box.width === 0) return { left: 0, top: 0, width: 0 };
  const width = Math.min(
    (box.width * STICKER_WIDTH_PCT) / 100,
    (area.width - 2 * SCREEN_MARGIN) / placement.scale,
  );
  const half = (width * placement.scale) / 2;
  const left = clamp(
    area.width / 2 + placement.x * box.width,
    half + SCREEN_MARGIN,
    area.width - half - SCREEN_MARGIN,
  );
  return { left, top: area.height / 2 + placement.y * box.height, width };
}
