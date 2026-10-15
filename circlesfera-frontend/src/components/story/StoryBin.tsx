import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BIN_BOTTOM, BIN_SIZE } from './storyGesture';

/**
 * The bin at the bottom of the canvas while a piece is dragged; a piece
 * dropped on it is removed. Not part of the exported picture.
 */
export default function StoryBin({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      data-export-ignore="true"
      data-testid="story-bin"
      data-active={active ? 'true' : 'false'}
      role="img"
      aria-label={t('createPost.storyComposer.drop_to_delete')}
      className={`absolute left-1/2 -translate-x-1/2 z-150 pointer-events-none flex items-center justify-center rounded-full border transition-transform duration-150 ${
        active
          ? 'scale-125 bg-white text-black border-white'
          : 'bg-black/55 text-white border-white/30'
      }`}
      style={{ width: BIN_SIZE, height: BIN_SIZE, bottom: BIN_BOTTOM }}
    >
      <Trash2 size={22} aria-hidden />
    </div>
  );
}
