import { toBlob } from 'html-to-image';
import { toast } from 'react-hot-toast';
import i18n from '../../i18n';
import { logger } from '../../utils/logger';

/** The size of the story canvas, in pixels, when the picture was taken. */
export interface StoryCanvasSize {
  width: number;
  height: number;
}

/** Export the story canvas node to a PNG blob (html-to-image). */
export async function exportStoryCanvas(options: {
  container: HTMLElement;
  backgroundUrl: string | null;
  bgStyle: string;
  elementCount: number;
  /**
   * Only what is painted, on a see-through picture: the background is a
   * video, which keeps playing as itself.
   */
  layerOnly?: boolean;
  /** The picture, and the size of the canvas it was taken from. */
  onPost: (blob: Blob, canvas: StoryCanvasSize) => void | Promise<void>;
}): Promise<void> {
  const { container, backgroundUrl, bgStyle, elementCount, layerOnly, onPost } =
    options;

  logger.log('Starting story export...', {
    hasBackground: !!backgroundUrl,
    bgStyle: bgStyle || 'none',
    elementCount,
  });

  const restore = decodePicturesWithTheExport(container);
  const blob = await toBlob(container, {
    quality: 0.95,
    backgroundColor:
      layerOnly || bgStyle.includes('gradient') || bgStyle.startsWith('#')
        ? undefined
        : '#000000',
    style: {
      borderRadius: '0',
      border: 'none',
      boxShadow: 'none',
      ...(layerOnly
        ? { backgroundColor: 'transparent', backgroundImage: 'none' }
        : {}),
    },
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true;
      return node.dataset.exportIgnore !== 'true';
    },
  }).finally(restore);

  if (!blob) throw new Error('Failed to generate image blob');

  logger.log(
    'Story export success, blob size:',
    (blob.size / 1024).toFixed(2),
    'KB',
  );
  await onPost(blob, {
    width: container.clientWidth,
    height: container.clientHeight,
  });
}

/**
 * Has every picture of the canvas decoded at once when the export paints it,
 * and returns what puts the canvas back as it was.
 *
 * The export paints the canvas as an SVG image. Safari decodes a large picture
 * inside it only after its first paint, and that paint is the export's only
 * one: the photo, the drawing and a song's cover came out blank, so a photo
 * story went out black with only its text. A picture marked `sync` is decoded
 * before it is painted. A drawing canvas is copied into the SVG as a picture
 * the export library marks `async`, so it is shown here as such a picture
 * itself, laid exactly where the canvas is, while the canvas is left out.
 */
function decodePicturesWithTheExport(container: HTMLElement): () => void {
  const undo: (() => void)[] = [];
  const restore = () => {
    for (const step of undo.splice(0)) step();
  };
  try {
    for (const img of container.querySelectorAll('img')) {
      const before = img.getAttribute('decoding');
      img.setAttribute('decoding', 'sync');
      undo.push(() =>
        before === null
          ? img.removeAttribute('decoding')
          : img.setAttribute('decoding', before),
      );
    }
    for (const canvas of container.querySelectorAll('canvas')) {
      if (canvas.dataset.exportIgnore === 'true') continue;
      // An empty canvas has no picture to show.
      if (!canvas.width || !canvas.height) continue;
      const copy = document.createElement('img');
      copy.src = canvas.toDataURL();
      copy.alt = '';
      copy.setAttribute('decoding', 'sync');
      copy.className = canvas.className;
      copy.style.cssText = canvas.style.cssText;
      copy.style.width = `${canvas.offsetWidth}px`;
      copy.style.height = `${canvas.offsetHeight}px`;
      canvas.before(copy);
      canvas.dataset.exportIgnore = 'true';
      undo.push(() => {
        copy.remove();
        delete canvas.dataset.exportIgnore;
      });
    }
  } catch (err) {
    restore();
    throw err;
  }
  return restore;
}

export function reportStoryExportError(err: unknown): void {
  // The cause is technical and untranslated: it goes to the log, and the
  // person gets the app's own message.
  logger.error('Story export failed:', err);
  toast.error(i18n.t('createPost.storyComposer.export_error'));
}

/** Whether a see-through picture has anything painted on it. */
export async function hasPaint(blob: Blob): Promise<boolean> {
  const bitmap = await createImageBitmap(blob);
  // Small enough to read at once; a stroke still leaves a mark at this size.
  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) return true;
  }
  return false;
}
