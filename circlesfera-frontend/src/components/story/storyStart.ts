import type { StoryElement } from '../../types';

/**
 * What the story editor opens with when a story is started from somewhere
 * else: the pieces already on it and, at times, a picture as its background.
 */
export interface StoryStart {
  elements: StoryElement[];
  /** A picture on the media host, or of the app itself, as the background. */
  backgroundUrl?: string;
}

/** The route of a new story, and what it starts from. */
export function storyStartRoute(start: StoryStart) {
  return {
    to: '/create?mode=story',
    options: { state: { storyStart: start } },
  } as const;
}

/** A secure address, or a path of the app's own origin. */
function isPictureAddress(url: unknown): url is string {
  return (
    typeof url === 'string' &&
    (url.startsWith('https://') ||
      // "//host" and "/\host" lead to another host.
      /^\/(?![/\\])/.test(url))
  );
}

/** What a new story starts from, read from the state of the route. */
export function readStoryStart(state: unknown): StoryStart | null {
  if (!state || typeof state !== 'object') return null;
  const start = (state as { storyStart?: unknown }).storyStart;
  if (!start || typeof start !== 'object') return null;
  const { elements, backgroundUrl } = start as Record<string, unknown>;
  if (!Array.isArray(elements)) return null;
  return {
    elements: elements as StoryElement[],
    backgroundUrl: isPictureAddress(backgroundUrl) ? backgroundUrl : undefined,
  };
}

/** The longest side of a background picture, as large as the story's. */
const MAX_SIDE = 1920;

/**
 * A picture of the media host as a file the editor can hold. It is read as
 * an image, which the media host allows from the app, and drawn again here.
 */
export function pictureFile(url: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ratio = Math.min(
        1,
        MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * ratio);
      canvas.height = Math.round(img.naturalHeight * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0) {
        reject(new Error('The picture could not be drawn'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(
                new File([blob], 'story_background.jpg', {
                  type: 'image/jpeg',
                }),
              )
            : reject(new Error('The picture could not be read')),
        'image/jpeg',
        0.92,
      );
    };
    img.onerror = () => reject(new Error('The picture could not be loaded'));
    img.src = url;
  });
}
