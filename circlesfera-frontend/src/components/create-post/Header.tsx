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
    <div className="px-5 h-(--nav-top-height,52px) md:h-18 border-b border-white/8 bg-white/2 backdrop-blur-xl z-30 shrink-0 flex justify-between items-center">
      <button
        type="button"
        onClick={onBack}
        className="w-11 h-11 -ml-2 hover:bg-white/8 rounded-xl text-white/80 hover:text-white transition-all outline-none focus:ring-2 focus:ring-white/10 flex items-center justify-center gap-1"
        aria-label="Volver"
      >
        <ChevronLeft size={22} strokeWidth={2} />
      </button>

      <h2
        className="font-black text-base sm:text-lg tracking-tight text-white"
        id="modal-title"
      >
        {title}
      </h2>

      <button
        type="button"
        onClick={onNext}
        disabled={isPending || !canNext}
        className={`
          px-5 h-11 flex items-center justify-center rounded-full font-bold text-xs sm:text-sm transition-all duration-200
          disabled:opacity-30 disabled:cursor-not-allowed active:scale-95
          ${
            nextLabel === t('createPost.header.share')
              ? 'bg-linear-to-r from-brand-primary to-brand-blue text-white shadow-lg shadow-brand-primary/25 hover:shadow-brand-primary/40'
              : 'text-brand-primary hover:text-white hover:bg-brand-primary/20 border border-brand-primary/30'
          }
        `}
      >
        {isPending ? <Loader2 size={16} className="animate-spin" /> : nextLabel}
      </button>
    </div>
  );
}
