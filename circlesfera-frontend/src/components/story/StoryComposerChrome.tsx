import { motion } from 'framer-motion';
import { Check, Loader2, RotateCcw, RotateCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

const iconBtn =
  'min-w-11 min-h-11 flex items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25';

/** Single top bar: close · undo/redo · done (handoff to Share step). */
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
    <header className="relative z-30 flex items-center justify-between gap-2 shrink-0 px-3.5 pb-1.5 pt-[max(0.75rem,calc(env(safe-area-inset-top,0px)+0.35rem))]">
      <button
        type="button"
        onClick={onClose}
        className={`${iconBtn} bg-white/10 text-white hover:bg-white/16`}
        aria-label={t('createPost.storyComposer.close')}
      >
        <X size={18} strokeWidth={2} />
      </button>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className={`${iconBtn} bg-white/10 text-white/80 hover:bg-white/16 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed`}
          aria-label={t('createPost.storyComposer.undo')}
        >
          <RotateCcw size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className={`${iconBtn} bg-white/10 text-white/80 hover:bg-white/16 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed`}
          aria-label={t('createPost.storyComposer.redo')}
        >
          <RotateCw size={16} strokeWidth={2} />
        </button>
      </div>

      <motion.button
        type="button"
        onClick={onPost}
        disabled={!canPost || isExporting}
        className="bg-linear-to-r from-brand-primary to-brand-blue text-white min-h-11 px-4 rounded-full font-bold text-xs
                   disabled:opacity-40 flex items-center gap-1.5 shadow-md shadow-brand-primary/25 transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
        whileTap={{ scale: 0.95 }}
      >
        {isExporting ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          <>
            {t('createPost.storyComposer.post')}{' '}
            <Check size={14} strokeWidth={2.5} />
          </>
        )}
      </motion.button>
    </header>
  );
}
