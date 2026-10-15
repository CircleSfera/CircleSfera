import { describe, expect, it } from 'vitest';
import {
  coverBox,
  normalizeDegrees,
  placementFromElement,
  placementOf,
  placementOfSticker,
  stickerOnScreen,
} from './storySticker';

describe('the place of a sticker on a story', () => {
  const canvas = { width: 360, height: 640 };

  it('is the centre as a share of the canvas, with its size and angle', () => {
    expect(
      placementFromElement({ x: 90, y: -64, scale: 0.8, rotation: 15 }, canvas),
    ).toEqual({ x: 0.25, y: -0.1, scale: 0.8, rotation: 15 });
  });

  it('stays within the story and the sizes a sticker may have', () => {
    expect(
      placementFromElement(
        { x: 400, y: -900, scale: 0.2, rotation: 0 },
        canvas,
      ),
    ).toEqual({ x: 0.5, y: -0.5, scale: 0.5, rotation: 0 });
  });

  it('is none while the canvas has no size', () => {
    expect(
      placementFromElement(
        { x: 0, y: 0, scale: 1, rotation: 0 },
        { width: 0, height: 640 },
      ),
    ).toBeUndefined();
  });

  it('turns any angle into one between -180 and 180 degrees', () => {
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-190)).toBe(170);
    expect(normalizeDegrees(180)).toBe(180);
    expect(normalizeDegrees(-180)).toBe(180);
    expect(normalizeDegrees(-45)).toBe(-45);
  });

  it('is read back from a story, or is none for one published without it', () => {
    expect(
      placementOf({
        id: 'p',
        stickerX: 0.1,
        stickerY: 0,
        stickerScale: 1,
        stickerRotation: -5,
      }),
    ).toEqual({ x: 0.1, y: 0, scale: 1, rotation: -5 });
    expect(placementOf({ id: 'p' })).toBeNull();
    expect(placementOf({ id: 'p', stickerX: 0.1, stickerY: null })).toBeNull();
    expect(placementOf(null)).toBeNull();
  });
});

describe('the box a story picture fills when it covers the screen', () => {
  it('is as tall as a tall phone and cut at the sides', () => {
    expect(coverBox({ width: 390, height: 844 })).toEqual({
      width: 474.75,
      height: 844,
    });
  });

  it('is as wide as a wider area and cut at the top and bottom', () => {
    expect(coverBox({ width: 450, height: 700 })).toEqual({
      width: 450,
      height: 800,
    });
  });

  it('is the area itself when it is 9:16', () => {
    expect(coverBox({ width: 360, height: 640 })).toEqual({
      width: 360,
      height: 640,
    });
  });

  it('is empty before the area is measured', () => {
    expect(coverBox({ width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });
});

describe('where a sticker goes on the screen', () => {
  const phone = { width: 390, height: 844 };

  it('keeps its place on a story shown whole', () => {
    const spot = stickerOnScreen(
      { x: 0.05, y: 0.2, scale: 1, rotation: 0 },
      { width: 360, height: 640 },
    );
    expect(spot.left).toBeCloseTo(198);
    expect(spot.top).toBeCloseTo(448);
    expect(spot.width).toBeCloseTo(295.2);
  });

  it('moves in from a side a tall phone cuts, staying at its height', () => {
    // The picture is 474.75 px wide on this screen: 42 px are cut each side.
    const spot = stickerOnScreen(
      { x: 0.25, y: -0.1, scale: 0.6, rotation: 0 },
      phone,
    );
    const half = (spot.width * 0.6) / 2;
    expect(spot.left + half).toBeCloseTo(390 - 8);
    expect(spot.top).toBeCloseTo(337.6);
  });

  it('is narrowed when its size would not fit the screen', () => {
    const spot = stickerOnScreen(
      { x: 0.3, y: 0, scale: 1.35, rotation: 0 },
      phone,
    );
    expect(spot.width * 1.35).toBeCloseTo(390 - 16);
    expect(spot.left).toBeCloseTo(195);
  });

  it('has no size before the screen is measured', () => {
    expect(
      stickerOnScreen(
        { x: 0, y: 0, scale: 1, rotation: 0 },
        { width: 0, height: 0 },
      ).width,
    ).toBe(0);
  });
});

describe('the place of a sticker of the feed', () => {
  it('is read from its own fields, or is none when it had none', () => {
    const base = { id: 's', kind: 'POLL' as const, settings: {} };
    expect(
      placementOfSticker({ ...base, x: 0.1, y: -0.2, scale: 1, rotation: 4 }),
    ).toEqual({ x: 0.1, y: -0.2, scale: 1, rotation: 4 });
    expect(
      placementOfSticker({
        ...base,
        x: null,
        y: null,
        scale: null,
        rotation: null,
      }),
    ).toBeNull();
  });
});
