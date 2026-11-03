import {
  DEFAULT_POST_SHAPE,
  POST_SHAPE_RATIO,
  POST_SHAPES,
  type PostShape,
} from '@circlesfera/shared';
import { describe, expect, it } from 'vitest';
import { nextShape, postAspectClass, shapeOf, shapeRatio } from './postShape';

describe('the shape of a post', () => {
  it('is the default for a post without one, as every post before shapes', () => {
    expect(shapeOf({})).toBe(DEFAULT_POST_SHAPE);
    expect(shapeOf({ shape: null })).toBe(DEFAULT_POST_SHAPE);
    expect(postAspectClass({ shape: null })).toBe(
      postAspectClass({ shape: DEFAULT_POST_SHAPE }),
    );
  });

  it('has its own box for each shape', () => {
    const classes = POST_SHAPES.map((shape) => postAspectClass({ shape }));
    expect(new Set(classes).size).toBe(POST_SHAPES.length);
    for (const shape of POST_SHAPES) {
      expect(shapeRatio(shape)).toEqual(POST_SHAPE_RATIO[shape]);
    }
  });

  it('the button goes through every shape and back to the first', () => {
    let shape: PostShape = POST_SHAPES[0];
    const seen: PostShape[] = [shape];
    for (let i = 1; i < POST_SHAPES.length; i++) {
      shape = nextShape(shape);
      seen.push(shape);
    }
    expect(seen).toEqual([...POST_SHAPES]);
    expect(nextShape(shape)).toBe(POST_SHAPES[0]);
  });
});
