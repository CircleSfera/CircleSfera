import {
  Crop,
  Layers,
  Scissors,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CREATE_PANEL, CREATE_TOOL } from '../create-post/createStyles';
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
      className="flex justify-center px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
      role="presentation"
    >
      <div
        className={`flex w-full md:max-w-sm gap-1 p-1 ${CREATE_PANEL}`}
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
              icon: Layers,
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
                className={`${CREATE_TOOL} ${
                  isActive ? 'bg-brand-primary/20 text-white!' : ''
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2 : 1.75} aria-hidden />
                <span>{tab.label}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
