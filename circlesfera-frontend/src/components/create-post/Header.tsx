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
  return (
    <header className="px-4 h-(--nav-top-height,52px) border-b border-white/8 bg-surface-elevated z-30 shrink-0 flex justify-between items-center">
      <button
        type="button"
        onClick={onBack}
        className="w-11 h-11 -ml-2 hover:bg-white/8 rounded-xl text-white/80 hover:text-white transition-all outline-none focus-visible:ring-2 focus-visible:ring-white/20 flex items-center justify-center"
        aria-label={t('createPost.header.back')}
      >
        <ChevronLeft size={22} strokeWidth={2} />
      </button>

      <h1
        className="font-bold text-base tracking-tight text-white"
        id="create-composer-title"
      >
        {title}
      </h1>

      <button
        type="button"
        onClick={onNext}
        disabled={isPending || !canNext || !nextLabel}
        className={`
          min-w-16 px-4 h-11 flex items-center justify-center rounded-full font-bold text-sm transition-all duration-200
          disabled:opacity-30 disabled:cursor-not-allowed active:scale-95
          outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50
          ${
            nextLabel === t('createPost.header.share')
              ? 'bg-linear-to-r from-brand-primary to-brand-blue text-white shadow-lg shadow-brand-primary/25'
              : 'text-brand-primary hover:text-white hover:bg-brand-primary/20 border border-brand-primary/30'
          }
        `}
      >
        {isPending ? <Loader2 size={16} className="animate-spin" /> : nextLabel}
      </button>
    </header>
  );
}
