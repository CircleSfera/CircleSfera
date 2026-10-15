import { RotateCcw, RotateCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import StoryToolRail from './StoryToolRail';
import type { StoryComposerTab } from './storyComposer.types';

interface StoryComposerChromeProps {
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  activeTab: StoryComposerTab;
  onSelectTab: (tab: StoryComposerTab) => void;
  /** While a piece is dragged the controls step aside. */
  hidden: boolean;
  /** Off for a moment after text mode, so its last tap does not land here. */
  pointerArmed: boolean;
}

const roundButton =
  'w-11 h-11 inline-flex items-center justify-center rounded-full bg-black/45 border border-white/15 text-white transition-colors hover:bg-black/60 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-35 disabled:cursor-not-allowed';

/**
 * The controls laid over the story canvas: close at the top left, undo and
 * redo at the top, and the tools in a column at the right. On desktop the
 * column stands beside the canvas.
 */
export default function StoryComposerChrome({
  onClose,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  activeTab,
  onSelectTab,
  hidden,
  pointerArmed,
}: StoryComposerChromeProps) {
  const { t } = useTranslation();

  return (
    <div
      // Touches pass through to the canvas; only the buttons take them.
      className={`absolute inset-0 z-40 pointer-events-none transition-opacity duration-150 ${
        hidden ? 'opacity-0' : 'opacity-100'
      } ${hidden || !pointerArmed ? '[&_*]:pointer-events-none!' : ''}`}
      aria-hidden={hidden || undefined}
    >
      <div className="absolute top-3 left-3 pointer-events-auto">
        <button
          type="button"
          onClick={onClose}
          className={roundButton}
          aria-label={t('createPost.storyComposer.close')}
        >
          <X size={20} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className={roundButton}
          aria-label={t('createPost.storyComposer.undo')}
        >
          <RotateCcw size={18} strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className={roundButton}
          aria-label={t('createPost.storyComposer.redo')}
        >
          <RotateCw size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="absolute top-3 right-3 md:right-auto md:left-full md:ml-4 pointer-events-auto">
        <StoryToolRail activeTab={activeTab} onSelectTab={onSelectTab} />
      </div>
    </div>
  );
}
