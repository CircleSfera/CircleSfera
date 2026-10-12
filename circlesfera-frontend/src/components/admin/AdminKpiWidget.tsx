import type { ReactNode } from 'react';

interface Props {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  iconColorClass?: string;
  trend?: {
    value: number;
    label: string;
  };
  // Three in a row on a phone: the icon waits for a wider screen.
  compact?: boolean;
}

// A figure whose value is already written (a text, a rate). It is drawn as
// StatCard draws a count, so that a page has one design of figure.
export function AdminKpiWidget({
  title,
  value,
  icon,
  iconColorClass = 'text-brand-primary-text bg-brand-primary/10',
  trend,
  compact = false,
}: Props) {
  return (
    <div className="glass-panel p-2 sm:p-2.5 rounded-lg relative overflow-hidden">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="text-white/50 text-[10px] sm:text-xs font-semibold uppercase tracking-wider mb-0.5 leading-tight line-clamp-2">
            {title}
          </p>
          <p className="text-lg sm:text-xl font-bold text-white tabular-nums tracking-tight leading-tight">
            {value}
          </p>
          {trend && (
            <p className="flex items-baseline gap-1.5 mt-0.5 sm:mt-1 text-[10px] sm:text-xs">
              <span
                className={`font-bold ${
                  trend.value >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {trend.value >= 0 ? '+' : ''}
                {trend.value}%
              </span>
              <span className="text-white/50">{trend.label}</span>
            </p>
          )}
        </div>
        <div
          className={`p-1.5 sm:p-2 rounded-md sm:rounded-lg border border-white/5 shrink-0 ${
            compact ? 'hidden sm:block' : ''
          } ${iconColorClass}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
