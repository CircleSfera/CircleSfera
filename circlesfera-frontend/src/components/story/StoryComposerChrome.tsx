import { MapPin, Music, RotateCcw, RotateCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import StoryToolRail from './StoryToolRail';
import type { StoryComposerTab } from './storyComposer.types';
import type { StoryShareOptions } from './storyShare.types';

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
  /** Music and place of the story, when the editor shares it itself. */
  share?: StoryShareOptions;
  /** The place is on the story as a sticker, so it is not shown twice. */
  placeOnStory?: boolean;
  /** The song shows as its sticker, so its chip is not needed. */
  musicOnStory?: boolean;
}

const roundButton =
  'w-11 h-11 inline-flex items-center justify-center rounded-full text-white [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.65))] transition-colors hover:bg-white/10 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-35 disabled:cursor-not-allowed';

const chip =
  'max-w-full min-h-11 px-3.5 inline-flex items-center gap-1.5 rounded-full bg-black/55 border border-white/15 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40';

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
  share,
  placeOnStory = false,
  musicOnStory = false,
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

      {/* Undo and redo show once there is something to undo or redo. */}
      <div
        className={`absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-auto ${
          canUndo || canRedo ? '' : 'invisible'
        }`}
      >
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
        <StoryToolRail
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          share={share}
        />
      </div>

      {share &&
      ((share.musicTitle && !musicOnStory) ||
        (share.placeName && !placeOnStory)) ? (
        // What was chosen for the story, at the bottom left; a tap changes it.
        <div className="absolute bottom-3 left-3 right-16 flex flex-col items-start gap-2 pointer-events-auto">
          {share.musicTitle && !musicOnStory ? (
            <button
              type="button"
              onClick={share.onOpenMusic}
              className={chip}
              aria-label={`${t('createPost.story.add_music')}: ${share.musicTitle}`}
            >
              <Music size={14} aria-hidden />
              <span className="truncate">{share.musicTitle}</span>
            </button>
          ) : null}
          {share.placeName && !placeOnStory ? (
            <button
              type="button"
              onClick={share.onOpenPlace}
              className={chip}
              aria-label={`${t('createPost.story.add_location')}: ${share.placeName}`}
            >
              <MapPin size={14} aria-hidden />
              <span className="truncate">{share.placeName}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
