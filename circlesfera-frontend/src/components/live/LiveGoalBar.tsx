import { Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface LiveGoalData {
  title: string;
  target: number;
  current: number;
}

interface LiveGoalBarProps {
  goal: LiveGoalData | null;
  onClick?: () => void;
  isHost?: boolean;
}

export default function LiveGoalBar({
  goal,
  onClick,
  isHost,
}: LiveGoalBarProps) {
  const { t } = useTranslation();
  if (!goal) {
    if (!isHost) return null;
    return (
      <button
        type="button"
        onClick={onClick}
        className="live-glass flex min-h-11 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white transition-transform active:scale-95"
      >
        <Target size={16} aria-hidden />
        <span>{t('live.goal.add')}</span>
      </button>
    );
  }

  const percentage = Math.min(
    100,
    Math.round((goal.current / goal.target) * 100),
  );

  // People watching see the goal; only the host can press it to change it.
  if (!onClick) {
    return (
      <div className="live-glass block min-h-11 w-48 select-none rounded-2xl px-3 py-2 text-left">
        <div className="flex justify-between items-center mb-1.5">
          <span className="truncate pr-2 text-xs font-semibold text-white">
            {goal.title}
          </span>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-white/85">
            {goal.current}/{goal.target}
          </span>
        </div>
        <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden relative">
          <div
            className="absolute top-0 left-0 h-full bg-linear-to-r from-brand-primary to-brand-blue transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="live-glass block min-h-11 w-48 cursor-pointer select-none rounded-2xl px-3 py-2 text-left transition-transform active:scale-95"
      onClick={onClick}
    >
      <div className="flex justify-between items-center mb-1.5">
        <span className="truncate pr-2 text-xs font-semibold text-white">
          {goal.title}
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-white/85">
          {goal.current}/{goal.target}
        </span>
      </div>
      <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden relative">
        <div
          className="absolute top-0 left-0 h-full bg-linear-to-r from-brand-primary to-brand-blue transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </button>
  );
}
