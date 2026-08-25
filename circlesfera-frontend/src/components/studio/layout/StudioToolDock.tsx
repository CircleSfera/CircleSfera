import {
  Film,
  type LucideIcon,
  Music,
  Sparkles,
  Type,
  Wand2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { StudioTab } from '../../../types/studio';

const TOOLS: { id: StudioTab; icon: LucideIcon; labelKey: string }[] = [
  { id: 'media', icon: Film, labelKey: 'studio.tools.media' },
  { id: 'text', icon: Type, labelKey: 'studio.tools.text' },
  { id: 'audio', icon: Music, labelKey: 'studio.tools.audio' },
  { id: 'filters', icon: Wand2, labelKey: 'studio.tools.filters' },
  { id: 'subtitles', icon: Sparkles, labelKey: 'studio.tools.captions' },
];

export default function StudioToolDock() {
  const { t } = useTranslation();
  const { activeTab, openSheet, setActiveTab, setOpenSheet } = useStudioStore();

  return (
    <nav
      aria-label={t('studio.tools.dock_label', 'Studio tools')}
      className="shrink-0 border-t border-white/10 bg-surface-elevated safe-area-bottom"
    >
      <div className="flex items-stretch justify-around px-1 pt-1 pb-1">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = openSheet === tool.id || activeTab === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                if (openSheet === tool.id) {
                  setOpenSheet(null);
                } else {
                  setActiveTab(tool.id);
                }
              }}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 min-h-11 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                isActive
                  ? 'text-brand-primary bg-brand-primary/10'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
              aria-pressed={isActive}
            >
              <Icon size={20} aria-hidden />
              <span className="truncate max-w-full">{t(tool.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
