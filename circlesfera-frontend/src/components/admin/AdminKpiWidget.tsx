import { type ReactNode } from 'react';

interface Props {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  iconColorClass?: string;
  trend?: {
    value: number;
    label: string;
  };
}

export function AdminKpiWidget({
  title,
  value,
  icon,
  iconColorClass = 'text-brand-primary bg-brand-primary/10',
  trend,
}: Props) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/2 p-4 sm:p-5 flex flex-col justify-between">
      <div className="flex justify-between items-start mb-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColorClass}`}
        >
          {icon}
        </div>
        {trend && (
          <div
            className={`text-xs font-semibold px-2 py-1 rounded-full ${
              trend.value >= 0
                ? 'text-green-400 bg-green-400/10'
                : 'text-red-400 bg-red-400/10'
            }`}
          >
            {trend.value >= 0 ? '+' : ''}
            {trend.value}%
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-white/50">{title}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-white">{value}</p>
          {trend && (
            <span className="text-xs text-white/40">{trend.label}</span>
          )}
        </div>
      </div>
    </div>
  );
}
