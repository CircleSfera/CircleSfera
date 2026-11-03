import {
  DEFAULT_POST_SHAPE,
  POST_SHAPE_RATIO,
  POST_SHAPES,
  type PostShape,
} from '@circlesfera/shared';

/**
 * The box each shape is drawn in. Written out whole so Tailwind finds the
 * classes; the ratios themselves come from the shared values.
 */
const ASPECT_CLASS: Record<PostShape, string> = {
  SQUARE: 'aspect-square',
  PORTRAIT: 'aspect-4/5',
  LANDSCAPE: 'aspect-[191/100]',
};

/** The shape a post shows in: its own, or the default for one without. */
export function shapeOf(post: { shape?: PostShape | null }): PostShape {
  return post.shape ?? DEFAULT_POST_SHAPE;
}

/** The aspect class of a post's media box. */
export function postAspectClass(post: { shape?: PostShape | null }): string {
  return ASPECT_CLASS[shapeOf(post)];
}

/** Width and height of a shape, for boxes sized in code. */
export function shapeRatio(shape: PostShape) {
  return POST_SHAPE_RATIO[shape];
}

/** The shape after this one, for the button that goes through them. */
export function nextShape(shape: PostShape): PostShape {
  return POST_SHAPES[(POST_SHAPES.indexOf(shape) + 1) % POST_SHAPES.length];
}
