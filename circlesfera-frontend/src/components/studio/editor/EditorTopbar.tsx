import {
  Check,
  ChevronLeft,
  Cloud,
  CloudOff,
  Loader2,
  Settings2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';

interface EditorTopbarProps {
  onClose: () => void;
  onExport: () => void;
  busy: boolean;
}

function SaveState() {
  const { t } = useTranslation();
  const status = useStudioStore((s) => s.saveStatus);
  if (status === 'idle') return null;
  const icon =
    status === 'saving' ? (
      <Loader2 size={14} className="animate-spin" aria-hidden />
    ) : status === 'saved' ? (
      <Cloud size={14} aria-hidden />
    ) : (
      <CloudOff size={14} className="text-brand-secondary" aria-hidden />
    );
  return (
    <span
      className="flex items-center gap-1 text-xs text-white/50"
      role="status"
    >
      {icon}
      <span className="hidden sm:inline">
        {t(`studio.save_status.${status}`)}
      </span>
    </span>
  );
}

/** Back to the projects, the project's name and settings, and export. */
export default function EditorTopbar({
  onClose,
  onExport,
  busy,
}: EditorTopbarProps) {
  const { t } = useTranslation();
  const name = useStudioStore((s) => s.project?.name ?? '');
  const openSheet = useStudioStore((s) => s.openSheet);
  const setOpenSheet = useStudioStore((s) => s.setOpenSheet);

  return (
    <header className="shrink-0 h-14 flex items-center gap-1 px-2 border-b border-white/10 bg-surface-base pt-safe">
      <button
        type="button"
        onClick={onClose}
        aria-label={t('studio.back_to_projects')}
        className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-white hover:bg-white/10"
      >
        <ChevronLeft size={22} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() =>
          setOpenSheet(openSheet === 'settings' ? null : 'settings')
        }
        aria-label={t('studio.settings.open')}
        aria-pressed={openSheet === 'settings'}
        className="flex min-w-0 flex-1 items-center gap-2 min-h-11 rounded-xl px-2 text-left hover:bg-white/5"
      >
        <span className="truncate text-sm font-bold text-white">{name}</span>
        <Settings2 size={16} className="shrink-0 text-white/50" aria-hidden />
      </button>
      <SaveState />
      <button
        type="button"
        onClick={onExport}
        disabled={busy}
        className="ml-1 min-h-11 flex items-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold text-black disabled:opacity-50"
      >
        <Check size={16} aria-hidden />
        {t('studio.export')}
      </button>
    </header>
  );
}
