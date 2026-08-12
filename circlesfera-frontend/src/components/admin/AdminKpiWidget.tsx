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

/** Dense KPI strip — icon + value in one short row for ops dashboards. */
export function AdminKpiWidget({
  title,
  value,
  icon,
  iconColorClass = 'text-brand-primary bg-brand-primary/10',
  trend,
}: Props) {
  return (
    <div className="glass-panel rounded-lg px-2.5 py-2 flex items-center gap-2.5 min-h-0">
      <div
        className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 border border-white/5 ${iconColorClass}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-white/45 truncate leading-tight">
          {title}
        </p>
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <p className="text-lg font-bold text-white tabular-nums leading-tight">
            {value}
          </p>
          {trend && (
            <>
              <span
                className={`text-[10px] font-bold ${
                  trend.value >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {trend.value >= 0 ? '+' : ''}
                {trend.value}%
              </span>
              <span className="text-[10px] text-white/35">{trend.label}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
