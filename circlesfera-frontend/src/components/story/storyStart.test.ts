import { describe, expect, it } from 'vitest';
import { readStoryStart, storyStartRoute } from './storyStart';

const mention = {
  id: 'm',
  type: 'mention' as const,
  content: '{}',
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
};

describe('a story started from another', () => {
  it('goes to the story editor with what it starts from', () => {
    const route = storyStartRoute({
      elements: [mention],
      backgroundUrl: 'https://res.cloudinary.com/x/a.jpg',
    });

    expect(route.to).toBe('/create?mode=story');
    expect(readStoryStart(route.options.state)).toEqual({
      elements: [mention],
      backgroundUrl: 'https://res.cloudinary.com/x/a.jpg',
    });
  });

  it('reads nothing from a route that brings nothing, or something else', () => {
    expect(readStoryStart(null)).toBeNull();
    expect(readStoryStart({})).toBeNull();
    expect(readStoryStart({ storyStart: { elements: 'x' } })).toBeNull();
  });

  it('takes a background only from a secure address or the app itself', () => {
    const background = (backgroundUrl: string) =>
      readStoryStart({ storyStart: { elements: [], backgroundUrl } })
        ?.backgroundUrl;

    expect(background('https://res.cloudinary.com/x/a.jpg')).toBe(
      'https://res.cloudinary.com/x/a.jpg',
    );
    expect(background('/uploads/a.jpg')).toBe('/uploads/a.jpg');
    expect(background('http://media.test/a.jpg')).toBeUndefined();
    expect(background('//media.test/a.jpg')).toBeUndefined();
    expect(background('/\\media.test/a.jpg')).toBeUndefined();
    expect(background('javascript:alert(1)')).toBeUndefined();
  });
});
