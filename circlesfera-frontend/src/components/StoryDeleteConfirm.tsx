import { Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface StoryDeleteConfirmProps {
  onConfirm: (e?: React.MouseEvent) => void;
  onCancel: (e?: React.MouseEvent) => void;
}

export function StoryDeleteConfirm({
  onConfirm,
  onCancel,
}: StoryDeleteConfirmProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        className="bg-surface-high rounded-xl p-6 w-[80%] max-w-xs shadow-2xl border border-white/10 transform scale-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          e.stopPropagation();
        }}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-1">
            <Trash2 size={24} />
          </div>
          <h3 className="text-white font-bold text-lg">
            {t('story.delete_title')}
          </h3>
          <p className="text-white/60 text-sm mb-4">
            {t('story.delete_warning')}
          </p>

          <div className="flex flex-col gap-2 w-full">
            <button
              type="button"
              onClick={onConfirm}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            >
              {t('story.delete')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-lg transition-colors"
            >
              {t('story.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
