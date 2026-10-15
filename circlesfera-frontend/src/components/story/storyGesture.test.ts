import { describe, expect, it } from 'vitest';
import {
  INTERACTIVE_SCALE,
  isOverBin,
  normalizeAngle,
  PIECE_SCALE,
  snapPiece,
  transformFromFingers,
} from './storyGesture';

const start = { x: 10, y: -20, scale: 1, rotation: 0 };

describe('moving a piece with the fingers', () => {
  it('moves it with one finger by as much as the finger moved', () => {
    expect(
      transformFromFingers(
        start,
        [{ x: 100, y: 100 }],
        [{ x: 130, y: 60 }],
        PIECE_SCALE,
      ),
    ).toEqual({ x: 40, y: -60, scale: 1, rotation: 0 });
  });

  it('scales it by how far two fingers spread, and moves it with their middle', () => {
    const piece = transformFromFingers(
      start,
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 80, y: 110 },
        { x: 280, y: 110 },
      ],
      PIECE_SCALE,
    );
    expect(piece.scale).toBeCloseTo(2);
    expect(piece.x).toBeCloseTo(40);
    expect(piece.y).toBeCloseTo(-10);
    expect(piece.rotation).toBeCloseTo(0);
  });

  it('turns it by the angle the two fingers turned', () => {
    const piece = transformFromFingers(
      start,
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ],
      PIECE_SCALE,
    );
    expect(piece.rotation).toBeCloseTo(90);
  });

  it('keeps a poll or question within the sizes the server accepts', () => {
    const wide = transformFromFingers(
      start,
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      INTERACTIVE_SCALE,
    );
    const narrow = transformFromFingers(
      start,
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      INTERACTIVE_SCALE,
    );
    expect(wide.scale).toBe(1.35);
    expect(narrow.scale).toBe(0.5);
  });

  it('turns any angle into one between -180 and 180 degrees', () => {
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-180)).toBe(180);
    expect(normalizeAngle(725)).toBe(5);
  });
});

describe('snapping', () => {
  it('puts a piece near the centre lines on them, and a piece nearly upright upright', () => {
    expect(snapPiece({ x: 5, y: -7, scale: 1, rotation: 3 })).toEqual({
      piece: { x: 0, y: 0, scale: 1, rotation: 0 },
      vertical: true,
      horizontal: true,
    });
  });

  it('leaves a piece away from the centre where it is', () => {
    expect(snapPiece({ x: 30, y: 9, scale: 1, rotation: 10 })).toEqual({
      piece: { x: 30, y: 9, scale: 1, rotation: 10 },
      vertical: false,
      horizontal: false,
    });
  });
});

describe('the bin', () => {
  const canvas = { width: 360, height: 640 };

  it('catches a finger at the bottom middle of the canvas', () => {
    // The bin's centre is at (180, 588).
    expect(isOverBin({ x: 180, y: 588 }, canvas)).toBe(true);
    expect(isOverBin({ x: 220, y: 610 }, canvas)).toBe(true);
  });

  it('lets a finger elsewhere go', () => {
    expect(isOverBin({ x: 180, y: 400 }, canvas)).toBe(false);
    expect(isOverBin({ x: 40, y: 600 }, canvas)).toBe(false);
  });
});
