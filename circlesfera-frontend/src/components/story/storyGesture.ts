/**
 * The arithmetic of moving, scaling and turning a piece of the story with the
 * fingers. Positions are in canvas pixels from its centre, as the pieces keep
 * them; angles in degrees.
 */

export interface Point {
  x: number;
  y: number;
}

export interface PieceTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface ScaleLimits {
  min: number;
  max: number;
}

/** A poll or a question keeps the sizes the server accepts. */
export const INTERACTIVE_SCALE: ScaleLimits = { min: 0.5, max: 1.35 };
/** Text, emoji and other pieces. */
export const PIECE_SCALE: ScaleLimits = { min: 0.1, max: 8 };

/** How close to the centre, in pixels, a piece snaps onto it. */
export const SNAP_PX = 8;
/** How close to upright, in degrees, a turned piece snaps upright. */
export const SNAP_DEG = 4;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const angle = (a: Point, b: Point) =>
  (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const midpoint = (a: Point, b: Point) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/** An angle turned into (-180, 180]. */
export function normalizeAngle(deg: number): number {
  const turned = ((((deg + 180) % 360) + 360) % 360) - 180;
  return turned === -180 ? 180 : turned;
}

/**
 * Where a piece is now, from where it was when the fingers came down and
 * where they were then and are now. One finger moves it; two move it by
 * their middle, scale it by their spread and turn it by their angle.
 */
export function transformFromFingers(
  start: PieceTransform,
  fingersAtStart: Point[],
  fingersNow: Point[],
  limits: ScaleLimits,
): PieceTransform {
  if (fingersAtStart.length >= 2 && fingersNow.length >= 2) {
    const [a0, b0] = fingersAtStart;
    const [a1, b1] = fingersNow;
    const spread0 = distance(a0, b0);
    const spread1 = distance(a1, b1);
    const m0 = midpoint(a0, b0);
    const m1 = midpoint(a1, b1);
    return {
      x: start.x + (m1.x - m0.x),
      y: start.y + (m1.y - m0.y),
      scale:
        spread0 > 0
          ? clamp(start.scale * (spread1 / spread0), limits.min, limits.max)
          : start.scale,
      rotation: normalizeAngle(start.rotation + angle(a1, b1) - angle(a0, b0)),
    };
  }
  const [from] = fingersAtStart;
  const [to] = fingersNow;
  if (!from || !to) return start;
  return {
    ...start,
    x: start.x + (to.x - from.x),
    y: start.y + (to.y - from.y),
  };
}

/** Snaps a piece onto the centre lines and upright, and says which held. */
export function snapPiece(piece: PieceTransform): {
  piece: PieceTransform;
  vertical: boolean;
  horizontal: boolean;
} {
  const vertical = Math.abs(piece.x) < SNAP_PX;
  const horizontal = Math.abs(piece.y) < SNAP_PX;
  const upright = Math.abs(piece.rotation) < SNAP_DEG;
  return {
    piece: {
      ...piece,
      x: vertical ? 0 : piece.x,
      y: horizontal ? 0 : piece.y,
      rotation: upright ? 0 : piece.rotation,
    },
    vertical,
    horizontal,
  };
}

/** Size of the bin and its distance from the bottom of the canvas, in px. */
export const BIN_SIZE = 56;
export const BIN_BOTTOM = 24;

/** Whether a finger, in canvas pixels from its top left, is over the bin. */
export function isOverBin(
  finger: Point,
  canvas: { width: number; height: number },
): boolean {
  const centre = {
    x: canvas.width / 2,
    y: canvas.height - BIN_BOTTOM - BIN_SIZE / 2,
  };
  return distance(finger, centre) <= BIN_SIZE;
}

/** A press that moved less than this, in pixels, is a tap. */
export const TAP_SLOP_PX = 4;
