import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface SubScreenHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  trailing?: ReactNode;
}

/**
 * Shared glass sticky header for caption subscreens (stepped path). Every
 * sub-screen returns to the caption step, so they all leave with the back
 * arrow.
 */
export default function SubScreenHeader({
  title,
  subtitle,
  onClose,
  trailing,
}: SubScreenHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2.5 px-3 min-h-13 py-1 bg-surface-elevated/95 backdrop-blur-md border-b border-white/8 shrink-0">
      <button
        type="button"
        onClick={onClose}
        className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/16 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25"
        aria-label={t('createPost.header.back')}
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-sm tracking-tight text-white truncate">
          {title}
        </h2>
        {subtitle ? (
          <p className="text-white/45 text-[11px] leading-snug line-clamp-2">
            {subtitle}
          </p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
