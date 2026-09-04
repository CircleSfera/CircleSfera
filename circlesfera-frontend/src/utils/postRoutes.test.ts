import { describe, expect, it } from 'vitest';
import { getPostPath } from './postRoutes';

describe('getPostPath', () => {
  it('routes FRAME posts to the Frames viewer with a post query param', () => {
    expect(getPostPath({ id: 'abc-123', type: 'FRAME' })).toBe(
      '/frames?post=abc-123',
    );
  });

  it('routes regular posts to post detail', () => {
    expect(getPostPath({ id: 'abc-123', type: 'POST' })).toBe('/p/abc-123');
    expect(getPostPath({ id: 'abc-123' })).toBe('/p/abc-123');
  });
});
