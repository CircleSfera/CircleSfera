import { PHOTO_FILTERS } from '../photo-editor/photoEditor.constants';
import { photoFilterClassCss } from '../photo-editor/photoEditor.look';
import type { ScaleLimits } from './storyGesture';

/**
 * The photo behind a story, as it is placed and coloured on the canvas. The
 * place is a share of the canvas size from its centre, so it holds when the
 * canvas changes size (a panel opens, the window turns); the scale is over
 * the size that just covers the story; angles are in degrees.
 */
export interface StoryPhotoEdit {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** Index in `STORY_PHOTO_FILTERS`; 0 is the photo as it is. */
  filter: number;
}

export const STORY_PHOTO_IDENTITY: StoryPhotoEdit = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  filter: 0,
};

/** From just covering the story up to four times that. */
export const PHOTO_SCALE: ScaleLimits = { min: 1, max: 4 };

/** The looks of the post photo editor, the first being none. */
export const STORY_PHOTO_FILTERS = PHOTO_FILTERS;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const isIdentityPhoto = (p: StoryPhotoEdit) =>
  p.x === 0 && p.y === 0 && p.scale === 1 && p.rotation === 0 && !p.filter;

/**
 * Keeps the photo within its limits. Its centre never leaves it: the photo
 * always covers the middle of the story, so it cannot be lost off the edge.
 */
export function clampPhoto(p: StoryPhotoEdit): StoryPhotoEdit {
  const scale = clamp(p.scale, PHOTO_SCALE.min, PHOTO_SCALE.max);
  const reach = scale / 2;
  return {
    ...p,
    scale,
    x: clamp(p.x, -reach, reach),
    y: clamp(p.y, -reach, reach),
  };
}

/** The filter one step on (`+1`) or back (`-1`), going round at the ends. */
export function stepFilter(index: number, direction: 1 | -1): number {
  const n = STORY_PHOTO_FILTERS.length;
  return (((index + direction) % n) + n) % n;
}

export const filterName = (index: number) =>
  STORY_PHOTO_FILTERS[index]?.name ?? STORY_PHOTO_FILTERS[0].name;

/** The CSS transform of the photo; the photo's own box is the canvas. */
export function photoTransformCss(p: StoryPhotoEdit): string | undefined {
  if (p.x === 0 && p.y === 0 && p.scale === 1 && p.rotation === 0) {
    return undefined;
  }
  return `translate(${p.x * 100}%, ${p.y * 100}%) rotate(${p.rotation}deg) scale(${p.scale})`;
}

/**
 * The CSS filter of the background picture: the look, then the blur and the
 * darkening of the background panel. Undefined when there is none.
 */
export function backgroundFilterCss(options: {
  filter: number;
  blur: number;
  darken: number;
}): string | undefined {
  const look = photoFilterClassCss(
    STORY_PHOTO_FILTERS[options.filter]?.class ?? '',
  );
  const parts = [look];
  if (options.blur > 0 || options.darken > 0) {
    parts.push(`blur(${options.blur}px) brightness(${100 - options.darken}%)`);
  }
  const css = parts.filter(Boolean).join(' ');
  return css || undefined;
}

/*
 * How a finger lifted from the photo is read. A press that moved no more than
 * the tap slop is a tap, which opens a text. A swipe changes the filter: one
 * finger, done within `SWIPE_MAX_MS`, at least `SWIPE_MIN_PX` sideways at
 * `SWIPE_MIN_SPEED` or faster, and at most half as much up or down as
 * sideways (within about 27 degrees of level). Anything else is a drag that
 * moved the photo. A slow sideways drag stays a drag.
 */
export const SWIPE_MAX_MS = 300;
export const SWIPE_MIN_PX = 48;
/** Pixels a millisecond: 48 px in 120 ms. */
export const SWIPE_MIN_SPEED = 0.4;
export const SWIPE_MAX_SLOPE = 0.5;

export type PhotoRelease =
  | { kind: 'tap' }
  | { kind: 'drag' }
  | { kind: 'swipe'; direction: 1 | -1 };

export function classifyPhotoRelease(r: {
  /** Whether any finger moved past the tap slop. */
  moved: boolean;
  /** The most fingers that were down at once. */
  fingers: number;
  dx: number;
  dy: number;
  ms: number;
}): PhotoRelease {
  if (!r.moved) return { kind: 'tap' };
  const sideways = Math.abs(r.dx);
  if (
    r.fingers === 1 &&
    r.ms > 0 &&
    r.ms <= SWIPE_MAX_MS &&
    sideways >= SWIPE_MIN_PX &&
    sideways / r.ms >= SWIPE_MIN_SPEED &&
    Math.abs(r.dy) <= sideways * SWIPE_MAX_SLOPE
  ) {
    // A swipe to the left brings the next filter in, as a page turns.
    return { kind: 'swipe', direction: r.dx < 0 ? 1 : -1 };
  }
  return { kind: 'drag' };
}

/** The share of the canvas an arrow key moves the photo; with Shift, 10×. */
export const KEY_MOVE = 0.01;
/** The factor + and − scale the photo by. */
export const KEY_SCALE = 1.1;

export type PhotoKeyAction =
  | { kind: 'edit'; photo: StoryPhotoEdit }
  | { kind: 'filter'; direction: 1 | -1 };

/** What a key does to the photo while the canvas has the focus. */
export function photoKeyAction(
  key: string,
  shift: boolean,
  photo: StoryPhotoEdit,
): PhotoKeyAction | null {
  const step = shift ? KEY_MOVE * 10 : KEY_MOVE;
  const moved = (dx: number, dy: number) => ({
    kind: 'edit' as const,
    photo: clampPhoto({ ...photo, x: photo.x + dx, y: photo.y + dy }),
  });
  const scaled = (factor: number) => ({
    kind: 'edit' as const,
    photo: clampPhoto({ ...photo, scale: photo.scale * factor }),
  });
  switch (key) {
    case 'ArrowLeft':
      return moved(-step, 0);
    case 'ArrowRight':
      return moved(step, 0);
    case 'ArrowUp':
      return moved(0, -step);
    case 'ArrowDown':
      return moved(0, step);
    case '+':
    case '=':
      return scaled(KEY_SCALE);
    case '-':
    case '_':
      return scaled(1 / KEY_SCALE);
    case '[':
      return { kind: 'filter', direction: -1 };
    case ']':
      return { kind: 'filter', direction: 1 };
    default:
      return null;
  }
}
