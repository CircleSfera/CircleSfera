import { clsx } from 'clsx';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: 'blue' | 'purple' | 'pink' | 'red' | 'green' | 'yellow';
  growth?: number | null;
  subtitle?: string;
  prefix?: string;
  suffix?: string;
  isCounter?: boolean;
  sparklineData?: number[];
}

const colorMap: Record<string, string> = {
  blue: 'text-brand-blue bg-brand-blue/10 border-brand-blue/20',
  purple: 'text-brand-primary bg-brand-primary/10 border-brand-primary/20',
  pink: 'text-brand-accent bg-brand-accent/10 border-brand-accent/20',
  red: 'text-brand-secondary bg-brand-secondary/10 border-brand-secondary/20',
  green: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  yellow: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
};

const strokeMap: Record<string, string> = {
  blue: '#5271ff',
  purple: '#8c52ff',
  pink: '#ff7657',
  red: '#ff5757',
  green: '#34d399',
  yellow: '#fbbf24',
};

const gradientMap: Record<string, string> = {
  blue: 'from-brand-blue/5 to-transparent',
  purple: 'from-brand-primary/5 to-transparent',
  pink: 'from-brand-accent/5 to-transparent',
  red: 'from-brand-secondary/5 to-transparent',
  green: 'from-emerald-600/5 to-transparent',
  yellow: 'from-amber-600/5 to-transparent',
};

const hoverGlow: Record<string, string> = {
  blue: 'hover:shadow-brand-blue/10 hover:border-brand-blue/20',
  purple: 'hover:shadow-brand-primary/10 hover:border-brand-primary/20',
  pink: 'hover:shadow-brand-accent/10 hover:border-brand-accent/20',
  red: 'hover:shadow-brand-secondary/10 hover:border-brand-secondary/20',
  green: 'hover:shadow-emerald-500/10 hover:border-emerald-500/20',
  yellow: 'hover:shadow-amber-500/10 hover:border-amber-500/20',
};

/** Animate a number from 0 → target over `duration` ms. */
function useCountUp(target: number, duration = 800) {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(target);

  useEffect(() => {
    prevTarget.current = target;

    const start = performance.now();
    let raf: number;

    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - (1 - progress) ** 3;
      setCount(Math.round(eased * target));

      if (progress < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return count;
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  color,
  growth,
  subtitle,
  prefix = '',
  suffix = '',
  isCounter = true,
  sparklineData,
}: StatCardProps) {
  const displayValue = useCountUp(value);
  const formattedValue = isCounter ? displayValue : value;

  // Generate simple SVG path for sparkline
  let sparklinePath = '';
  if (sparklineData && sparklineData.length > 1) {
    const min = Math.min(...sparklineData);
    const max = Math.max(...sparklineData);
    const range = max - min || 1; // avoid division by zero
    const points = sparklineData.map((val, i) => {
      const x = (i / (sparklineData.length - 1)) * 100;
      const y = 100 - ((val - min) / range) * 100;
      return `${x},${y}`;
    });
    // Smooth the line a bit (basic polyline)
    sparklinePath = `M ${points.join(' L ')}`;
  }

  return (
    <div
      className={clsx(
        'p-4 rounded-lg border border-white/5 bg-white/2 transition-colors cursor-default relative overflow-hidden',
        'hover:border-white/10',
        hoverGlow[color],
      )}
    >
      <div
        className={clsx(
          'absolute inset-0 bg-linear-to-br opacity-50',
          gradientMap[color],
        )}
      />

      {sparklineData && sparklineData.length > 1 && (
        <svg
          aria-hidden="true"
          className="absolute bottom-0 left-0 w-full h-1/2 opacity-20 pointer-events-none"
          preserveAspectRatio="none"
          viewBox="0 -10 100 120"
        >
          <path
            d={sparklinePath}
            fill="none"
            stroke={strokeMap[color]}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="min-w-0">
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-0.5">
            {label}
          </p>
          <p className="text-2xl font-bold text-white tabular-nums tracking-tight">
            {prefix}
            {formattedValue.toLocaleString()}
            {suffix}
          </p>
          {growth !== undefined && growth !== null && (
            <div
              className={clsx(
                'flex items-center gap-1 mt-1 text-xs font-bold',
                growth > 0 && 'text-emerald-400',
                growth < 0 && 'text-rose-400',
                growth === 0 && 'text-white/40',
              )}
            >
              {growth > 0 && <TrendingUp size={11} />}
              {growth < 0 && <TrendingDown size={11} />}
              {growth === 0 && <Minus size={11} />}
              <span>
                {growth > 0 ? '+' : ''}
                {growth}%
              </span>
            </div>
          )}
          {subtitle && (
            <p className="text-white/40 text-xs mt-0.5">{subtitle}</p>
          )}
        </div>
        <div
          className={clsx(
            'p-2 rounded-lg border border-white/5 shrink-0 bg-white/4',
            colorMap[color],
          )}
        >
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}
