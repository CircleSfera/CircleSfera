import { Crop, Scissors, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PhotoEditorState } from './usePhotoEditor';

export default function PhotoEditorTabs({
  editor,
}: {
  editor: PhotoEditorState;
}) {
  const { t } = useTranslation();
  const { activeTab, setActiveTab, isVideo, setDrawMode } = editor;

  return (
    <div
      className="flex justify-center px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
      role="presentation"
    >
      <div
        className="flex w-full max-w-[280px] gap-0.5 rounded-xl bg-white/5 p-0.5 border border-white/8"
        role="tablist"
        aria-label={t('createPost.edit.filters_adjustments')}
      >
        {(
          [
            {
              id: 'FILTERS' as const,
              icon: Sparkles,
              label: t('createPost.edit.tab_filters'),
              show: true,
            },
            {
              id: 'ADJUST' as const,
              icon: SlidersHorizontal,
              label: t('createPost.edit.tab_adjust'),
              show: true,
            },
            {
              id: 'CROP' as const,
              icon: Crop,
              label: t('createPost.edit.tab_crop'),
              show: !isVideo,
            },
            {
              id: 'TRIM' as const,
              icon: Scissors,
              label: t('createPost.edit.tab_trim'),
              show: isVideo,
            },
            {
              id: 'OVERLAY' as const,
              icon: Sparkles,
              label: t('createPost.edit.tab_overlay'),
              show: !isVideo,
            },
          ] as const
        )
          .filter((tab) => tab.show)
          .map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'OVERLAY') setDrawMode(false);
                }}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-11 py-1.5 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                  isActive
                    ? 'bg-white/12 text-white'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Icon size={16} strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                  {tab.label}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
