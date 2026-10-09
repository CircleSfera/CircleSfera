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
        className="flex items-center gap-1.5 min-h-11 px-4 bg-black/40 border border-white/10 border-dashed rounded-full text-white/70 hover:bg-black/60 hover:text-white transition-all text-xs"
      >
        <Target size={14} />
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
      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl min-h-11 px-3 py-2 w-48 shadow-lg select-none transition-colors block text-left">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-bold text-white tracking-wide uppercase truncate pr-2">
            {goal.title}
          </span>
          <span className="text-xs font-black text-brand-accent shrink-0">
            {goal.current}/{goal.target}
          </span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden relative">
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
      className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl min-h-11 px-3 py-2 w-48 shadow-lg select-none cursor-pointer hover:bg-black/50 transition-colors block text-left"
      onClick={onClick}
    >
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-bold text-white tracking-wide uppercase truncate pr-2">
          {goal.title}
        </span>
        <span className="text-xs font-black text-brand-accent shrink-0">
          {goal.current}/{goal.target}
        </span>
      </div>
      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden relative">
        <div
          className="absolute top-0 left-0 h-full bg-linear-to-r from-brand-primary to-brand-blue transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </button>
  );
}
