/**
 * The shape of a post: every item of a post shows in the same one, chosen in
 * the editor. A post from before shapes existed has none and shows as the
 * default.
 */
export const POST_SHAPES = ['SQUARE', 'PORTRAIT', 'LANDSCAPE'] as const;
export type PostShape = (typeof POST_SHAPES)[number];

/** How a post without a shape is shown, and the shape a new post starts on. */
export const DEFAULT_POST_SHAPE: PostShape = 'PORTRAIT';

/** Width to height of each shape: 1:1, 4:5 and 1.91:1. */
export const POST_SHAPE_RATIO: Record<
  PostShape,
  { width: number; height: number }
> = {
  SQUARE: { width: 1, height: 1 },
  PORTRAIT: { width: 4, height: 5 },
  LANDSCAPE: { width: 191, height: 100 },
};
