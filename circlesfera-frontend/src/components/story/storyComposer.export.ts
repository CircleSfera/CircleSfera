import { toBlob } from 'html-to-image';
import { toast } from 'react-hot-toast';
import i18n from '../../i18n';
import { logger } from '../../utils/logger';

/** Export the story canvas node to a PNG blob (html-to-image). */
export async function exportStoryCanvas(options: {
  container: HTMLElement;
  backgroundUrl: string | null;
  bgStyle: string;
  elementCount: number;
  onPost: (blob: Blob) => void | Promise<void>;
}): Promise<void> {
  const { container, backgroundUrl, bgStyle, elementCount, onPost } = options;

  logger.log('Starting story export...', {
    hasBackground: !!backgroundUrl,
    bgStyle: bgStyle || 'none',
    elementCount,
  });

  const blob = await toBlob(container, {
    quality: 0.95,
    backgroundColor:
      bgStyle.includes('gradient') || bgStyle.startsWith('#')
        ? undefined
        : '#000000',
    style: { borderRadius: '0', border: 'none', boxShadow: 'none' },
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
  await onPost(blob);
}

export function reportStoryExportError(err: unknown): void {
  logger.error('Story export failed:', err);
  const detail = err instanceof Error ? err.message : String(err);
  toast.error(
    `${i18n.t('createPost.storyComposer.export_error')}${detail ? `: ${detail}` : ''}`,
  );
}
