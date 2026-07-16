import { ChevronLeft, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ProgressStepper from './ProgressStepper';

interface HeaderProps {
  onBack: () => void;
  onNext: () => void;
  title: string;
  nextLabel: string | null;
  isPending: boolean;
  canNext: boolean;
  step: 'upload' | 'edit' | 'caption';
  mode: 'POST' | 'FRAME' | 'STORY';
}

export default function Header({
  onBack,
  onNext,
  title,
  nextLabel,
  isPending,
  canNext,
  step,
  mode,
}: HeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="px-4 pt-4 pb-0 z-30 shrink-0">
      {/* Top bar: Back + Title + Action */}
      <div className="flex justify-between items-center mb-1">
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-1 hover:bg-white/5 rounded-xl text-white/70 hover:text-white transition-all outline-none focus:ring-2 focus:ring-white/10"
          aria-label="Go back"
        >
          <ChevronLeft size={22} strokeWidth={2} />
        </button>

        <h2
          className="font-bold text-[15px] tracking-tight text-white/90"
          id="modal-title"
        >
          {title}
        </h2>

        <button
          type="button"
          onClick={onNext}
          disabled={isPending || !canNext}
          className={`
            px-4 py-1.5 rounded-xl font-bold text-sm transition-all duration-200
            disabled:opacity-30 disabled:cursor-not-allowed
            ${
              nextLabel === t('createPost.header.share')
                ? 'bg-linear-to-r from-brand-primary to-brand-blue text-white shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/30 active:scale-95'
                : 'text-brand-primary hover:text-brand-primary/80 hover:bg-brand-primary/10'
            }
          `}
        >
          {isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            nextLabel
          )}
        </button>
      </div>

      {/* Progress Stepper */}
      <ProgressStepper currentStep={step} mode={mode} />
    </div>
  );
}
