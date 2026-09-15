import { ChevronLeft, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface HeaderProps {
  onBack: () => void;
  onNext: () => void;
  title: string;
  nextLabel: string | null;
  isPending: boolean;
  canNext: boolean;
}

export default function Header({
  onBack,
  onNext,
  title,
  nextLabel,
  isPending,
  canNext,
}: HeaderProps) {
  const { t } = useTranslation();
  const isShare = nextLabel === t('createPost.header.share');

  return (
    <header className="px-3 min-h-11 py-1.5 z-30 shrink-0 flex justify-between items-center gap-2.5 bg-linear-to-b from-black/60 via-surface-elevated/95 to-transparent border-b border-white/8">
      <button
        type="button"
        onClick={onBack}
        className="min-w-9 min-h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/16 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25 shrink-0"
        aria-label={t('createPost.header.back')}
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </button>

      <h1
        className="font-semibold text-sm tracking-tight text-white truncate max-w-full flex-1 text-center px-1"
        id="create-composer-title"
      >
        {title}
      </h1>

      <button
        type="button"
        onClick={onNext}
        disabled={isPending || !canNext || !nextLabel}
        className={`
          min-w-14 min-h-9 px-3 flex items-center justify-center rounded-full font-bold text-xs transition-all duration-200 shrink-0
          disabled:opacity-30 disabled:cursor-not-allowed active:scale-95
          outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50
          ${
            isShare
              ? 'bg-linear-to-r from-brand-primary to-brand-blue text-white shadow-md shadow-brand-primary/20'
              : 'text-brand-primary hover:text-white hover:bg-brand-primary/15 border border-brand-primary/35'
          }
        `}
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : nextLabel}
      </button>
    </header>
  );
}
