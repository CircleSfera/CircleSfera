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
  });

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
