import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_PHOTO_ADJUSTMENTS,
  PHOTO_ADJUSTMENT_CONFIG,
} from '../photoEditor.constants';
import type { PhotoEditorState } from '../usePhotoEditor';

export default function PhotoAdjustmentSelector({
  editor,
}: {
  editor: PhotoEditorState;
}) {
  const { t } = useTranslation();
  const {
    activeAdjustment,
    setActiveAdjustment,
    adjustments,
    setAdjustments,
    isAdjusted,
  } = editor;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="overflow-hidden"
    >
      <div className="flex lg:justify-center overflow-x-auto py-1.5 border-b border-white/6 no-scrollbar px-4 scroll-px-4 gap-0.5">
        {PHOTO_ADJUSTMENT_CONFIG.map((adj) => {
          const isActive = activeAdjustment === adj.key;
          const isModified =
            adjustments[adj.key] !== DEFAULT_PHOTO_ADJUSTMENTS[adj.key];
          return (
            <button
              type="button"
              key={adj.key}
              onClick={() => setActiveAdjustment(adj.key)}
              className={`px-2.5 min-h-11 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                isActive
                  ? 'text-white bg-white/10'
                  : isModified
                    ? 'text-brand-primary/90 hover:text-brand-primary'
                    : 'text-white/35 hover:text-white/55'
              }`}
            >
              {t(`createPost.edit.adjust.${adj.labelKey}`)}
              {isModified && !isActive ? (
                <span className="ml-1 w-1 h-1 bg-brand-primary rounded-full inline-block align-middle" />
              ) : null}
            </button>
          );
        })}

        {isAdjusted && (
          <button
            type="button"
            onClick={() => setAdjustments(DEFAULT_PHOTO_ADJUSTMENTS)}
            className="px-2.5 min-h-11 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap
                                 text-red-400/70 hover:text-red-400 ml-auto flex items-center gap-1 transition-colors"
          >
            <RotateCcw size={10} /> {t('createPost.edit.reset')}
          </button>
        )}
      </div>
    </motion.div>
  );
}
