import {
  Cloud,
  Download,
  FolderOpen,
  Monitor,
  Redo2,
  Scissors,
  Smartphone,
  Square,
  Undo2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStudioStore } from '../../../stores/studioStore';
import type { AspectRatioType } from '../../../types/studio';

interface StudioTopbarProps {
  onOpenDrafts: () => void;
  onExport: () => void;
  isExporting: boolean;
  onSave: () => void;
}

export default function StudioTopbar({
  onOpenDrafts,
  onExport,
  isExporting,
  onSave,
}: StudioTopbarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    project,
    setProjectName,
    undo,
    redo,
    canUndo,
    canRedo,
    setAspectRatio,
    saveStatus,
  } = useStudioStore();

  const currentAspect: AspectRatioType = project?.aspectRatio || '9:16';

  const saveLabel =
    saveStatus === 'saving'
      ? t('studio.saving')
      : saveStatus === 'saved'
        ? t('studio.saved')
        : saveStatus === 'error'
          ? t('studio.save_error_short')
          : t('studio.save');

  return (
    <div className="pt-safe bg-surface-elevated border-b border-white/10 z-30 shrink-0">
      <div className="min-h-14 py-1 flex items-center justify-between px-2 sm:px-3">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="min-h-11 min-w-11 flex items-center justify-center hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
            aria-label={t('studio.exit')}
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-brand-primary flex items-center justify-center shadow-lg shadow-brand-primary/30 shrink-0">
              <Scissors size={14} className="text-white" aria-hidden />
            </div>
            <input
              type="text"
              value={project?.name || t('studio.default_project_name')}
              onChange={(e) => setProjectName(e.target.value)}
              className="bg-transparent border-none text-xs sm:text-sm font-bold text-white w-20 sm:w-36 focus:w-44 transition-all outline-none focus:ring-1 focus:ring-brand-primary/50 rounded px-1.5 py-0.5 placeholder:text-white/30 truncate"
              aria-label={t('studio.project_name')}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 md:p-1.5 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
              aria-label={t('studio.undo')}
            >
              <Undo2 size={15} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 md:p-1.5 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
              aria-label={t('studio.redo')}
            >
              <Redo2 size={15} />
            </button>
          </div>

          <div className="hidden md:flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5 ml-1">
            {(
              [
                { id: '9:16' as const, icon: Smartphone },
                { id: '16:9' as const, icon: Monitor },
                { id: '1:1' as const, icon: Square },
                { id: '4:5' as const, icon: Smartphone },
              ] as const
            ).map((ratio) => {
              const Icon = ratio.icon;
              const isSelected = currentAspect === ratio.id;
              return (
                <button
                  key={ratio.id}
                  type="button"
                  onClick={() => setAspectRatio(ratio.id)}
                  className={`flex items-center justify-center gap-1 px-2 min-h-11 rounded-lg text-[11px] font-bold transition-all ${
                    isSelected
                      ? 'bg-brand-primary text-white shadow-sm'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                  aria-pressed={isSelected}
                  aria-label={ratio.id}
                >
                  <Icon size={12} />
                  <span>{ratio.id}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenDrafts}
            className="flex items-center gap-1.5 text-white/70 hover:text-white hover:bg-white/5 px-2 min-h-11 rounded-xl text-xs font-semibold transition-colors"
            aria-label={t('studio.open_drafts')}
          >
            <FolderOpen size={15} />
            <span className="hidden lg:inline">{t('studio.open')}</span>
          </button>

          <button
            type="button"
            onClick={onSave}
            className="flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/5 px-2 min-h-11 rounded-xl text-xs font-semibold transition-colors"
            aria-label={saveLabel}
          >
            <Cloud
              size={15}
              className={
                saveStatus === 'saving'
                  ? 'animate-pulse text-brand-primary'
                  : ''
              }
            />
            <span className="hidden lg:inline">{saveLabel}</span>
          </button>

          <button
            type="button"
            onClick={onExport}
            disabled={isExporting}
            className="ml-1 bg-brand-primary hover:bg-brand-primary/90 text-white font-bold h-11 md:h-9 px-3 rounded-xl text-xs shadow-lg shadow-brand-primary/25 transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download size={14} />
            <span>{t('studio.export')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
