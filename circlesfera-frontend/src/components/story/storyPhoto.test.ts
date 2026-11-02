import { describe, expect, it } from 'vitest';
import {
  backgroundFilterCss,
  clampPhoto,
  classifyPhotoRelease,
  filterName,
  isIdentityPhoto,
  photoKeyAction,
  photoTransformCss,
  STORY_PHOTO_FILTERS,
  STORY_PHOTO_IDENTITY,
  SWIPE_MAX_MS,
  SWIPE_MIN_PX,
  stepFilter,
} from './storyPhoto';

const release = (over: Partial<Parameters<typeof classifyPhotoRelease>[0]>) =>
  classifyPhotoRelease({
    moved: true,
    fingers: 1,
    dx: -80,
    dy: 0,
    ms: 150,
    ...over,
  });

describe('classifyPhotoRelease', () => {
  it('reads a press that did not move as a tap, which opens a text', () => {
    expect(release({ moved: false, dx: 0 })).toEqual({ kind: 'tap' });
  });

  it('reads a quick, short, level flick as a swipe: left brings the next filter, right the one before', () => {
    expect(release({ dx: -80 })).toEqual({ kind: 'swipe', direction: 1 });
    expect(release({ dx: 80 })).toEqual({ kind: 'swipe', direction: -1 });
  });

  it('holds the swipe to its thresholds: 48 px, 300 ms, 0.4 px/ms, half as much up as sideways', () => {
    expect(release({ dx: -SWIPE_MIN_PX, ms: 100 }).kind).toBe('swipe');
    expect(release({ dx: -(SWIPE_MIN_PX - 1), ms: 50 }).kind).toBe('drag');
    expect(release({ dx: -200, ms: SWIPE_MAX_MS }).kind).toBe('swipe');
    expect(release({ dx: -200, ms: SWIPE_MAX_MS + 1 }).kind).toBe('drag');
    // 60 px in 200 ms is 0.3 px/ms: a slow sideways drag moves the photo.
    expect(release({ dx: -60, ms: 200 }).kind).toBe('drag');
    expect(release({ dx: -80, dy: 40 }).kind).toBe('swipe');
    expect(release({ dx: -80, dy: 41 }).kind).toBe('drag');
  });

  it('never reads two fingers as a swipe', () => {
    expect(release({ fingers: 2 }).kind).toBe('drag');
  });
});

describe('the photo edit', () => {
  it('scales from covering the story up to four times, and keeps its centre on the story', () => {
    expect(clampPhoto({ ...STORY_PHOTO_IDENTITY, scale: 0.5 }).scale).toBe(1);
    expect(clampPhoto({ ...STORY_PHOTO_IDENTITY, scale: 9 }).scale).toBe(4);
    expect(clampPhoto({ ...STORY_PHOTO_IDENTITY, x: 3, y: -3 })).toMatchObject({
      x: 0.5,
      y: -0.5,
    });
    expect(
      clampPhoto({ ...STORY_PHOTO_IDENTITY, scale: 2, x: 3 }),
    ).toMatchObject({ x: 1 });
  });

  it('goes round the filters of the post editor at both ends', () => {
    const last = STORY_PHOTO_FILTERS.length - 1;
    expect(stepFilter(0, 1)).toBe(1);
    expect(stepFilter(last, 1)).toBe(0);
    expect(stepFilter(0, -1)).toBe(last);
    expect(filterName(1)).toBe('Clarendon');
    expect(filterName(99)).toBe('Normal');
  });

  it('draws the place as a transform, and nothing when it is untouched', () => {
    expect(photoTransformCss(STORY_PHOTO_IDENTITY)).toBeUndefined();
    expect(
      photoTransformCss({ x: 0.1, y: -0.2, scale: 2, rotation: 30, filter: 3 }),
    ).toBe('translate(10%, -20%) rotate(30deg) scale(2)');
    expect(isIdentityPhoto(STORY_PHOTO_IDENTITY)).toBe(true);
    expect(isIdentityPhoto({ ...STORY_PHOTO_IDENTITY, filter: 1 })).toBe(false);
  });

  it('draws the filter as CSS, followed by the blur and darkening of the background', () => {
    expect(backgroundFilterCss({ filter: 0, blur: 0, darken: 0 })).toBe(
      undefined,
    );
    expect(backgroundFilterCss({ filter: 1, blur: 0, darken: 0 })).toBe(
      'brightness(110%) contrast(125%) saturate(125%)',
    );
    expect(backgroundFilterCss({ filter: 3, blur: 2, darken: 30 })).toBe(
      'grayscale(100%) brightness(110%) contrast(110%) blur(2px) brightness(70%)',
    );
    expect(backgroundFilterCss({ filter: 2, blur: 0, darken: 0 })).toContain(
      'hue-rotate(350deg)',
    );
    expect(backgroundFilterCss({ filter: 4, blur: 0, darken: 0 })).toContain(
      'sepia(15%)',
    );
  });
});

describe('photoKeyAction', () => {
  const photo = STORY_PHOTO_IDENTITY;

  it('moves the photo with the arrows, ten times as far with Shift', () => {
    expect(photoKeyAction('ArrowRight', false, photo)).toEqual({
      kind: 'edit',
      photo: { ...photo, x: 0.01 },
    });
    expect(photoKeyAction('ArrowUp', true, photo)).toEqual({
      kind: 'edit',
      photo: { ...photo, y: -0.1 },
    });
    expect(photoKeyAction('ArrowLeft', false, photo)).toMatchObject({
      photo: { x: -0.01 },
    });
    expect(photoKeyAction('ArrowDown', false, photo)).toMatchObject({
      photo: { y: 0.01 },
    });
  });

  it('scales it with + and -, within its limits', () => {
    expect(photoKeyAction('+', false, photo)).toMatchObject({
      photo: { scale: 1.1 },
    });
    expect(photoKeyAction('=', false, photo)).toMatchObject({
      photo: { scale: 1.1 },
    });
    expect(photoKeyAction('-', false, photo)).toMatchObject({
      photo: { scale: 1 },
    });
  });

  it('changes the filter with [ and ], and leaves other keys alone', () => {
    expect(photoKeyAction(']', false, photo)).toEqual({
      kind: 'filter',
      direction: 1,
    });
    expect(photoKeyAction('[', false, photo)).toEqual({
      kind: 'filter',
      direction: -1,
    });
    expect(photoKeyAction('a', false, photo)).toBeNull();
    expect(photoKeyAction('Enter', false, photo)).toBeNull();
  });
});
