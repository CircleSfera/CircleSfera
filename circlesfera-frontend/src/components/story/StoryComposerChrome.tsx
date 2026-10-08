import { RotateCcw, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EditorHeader, {
  EditorHeaderAction,
  editorIconButton,
} from '../create-post/EditorHeader';

interface StoryComposerChromeProps {
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onPost: () => void;
  canPost: boolean;
  isExporting: boolean;
}

const historyButton = `${editorIconButton} text-white/80 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed`;

/** Top bar of the story composer: close, undo and redo, done. */
export default function StoryComposerChrome({
  onClose,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onPost,
  canPost,
  isExporting,
}: StoryComposerChromeProps) {
  const { t } = useTranslation();

  return (
    <EditorHeader
      surface="overlay"
      leading="close"
      leadingLabel={t('createPost.storyComposer.close')}
      onLeading={onClose}
      center={
        <div className="flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={historyButton}
            aria-label={t('createPost.storyComposer.undo')}
          >
            <RotateCcw size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className={historyButton}
            aria-label={t('createPost.storyComposer.redo')}
          >
            <RotateCw size={16} strokeWidth={2} />
          </button>
        </div>
      }
      trailing={
        <EditorHeaderAction
          label={t('createPost.storyComposer.post')}
          onClick={onPost}
          disabled={!canPost}
          isPending={isExporting}
          withCheck
        />
      }
    />
  );
}
