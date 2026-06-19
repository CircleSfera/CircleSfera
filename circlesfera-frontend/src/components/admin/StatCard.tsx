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
  blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  purple: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  pink: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
  red: 'text-red-400 bg-red-400/10 border-red-400/20',
  green: 'text-green-400 bg-green-400/10 border-green-400/20',
  yellow: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
};

const strokeMap: Record<string, string> = {
  blue: '#60a5fa',
  purple: '#c084fc',
  pink: '#f472b6',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
};

const gradientMap: Record<string, string> = {
  blue: 'from-blue-600/5 to-transparent',
  purple: 'from-purple-600/5 to-transparent',
  pink: 'from-pink-600/5 to-transparent',
  red: 'from-red-600/5 to-transparent',
  green: 'from-green-600/5 to-transparent',
  yellow: 'from-yellow-600/5 to-transparent',
};

const hoverGlow: Record<string, string> = {
  blue: 'hover:shadow-blue-500/10 hover:border-blue-500/20',
  purple: 'hover:shadow-purple-500/10 hover:border-purple-500/20',
  pink: 'hover:shadow-pink-500/10 hover:border-pink-500/20',
  red: 'hover:shadow-red-500/10 hover:border-red-500/20',
  green: 'hover:shadow-green-500/10 hover:border-green-500/20',
  yellow: 'hover:shadow-yellow-500/10 hover:border-yellow-500/20',
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
        'glass-panel p-4 rounded-xl border border-white/5 transition-all duration-300 cursor-default relative overflow-hidden',
        'hover:border-white/10 hover:scale-[1.01] hover:shadow-md',
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
          <p className="text-white/40 text-xs font-black uppercase tracking-wider mb-0.5">
            {label}
          </p>
          <p className="text-2xl font-black text-white tabular-nums tracking-tight">
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
            'p-2 rounded-lg border border-white/5 shrink-0 bg-black/40 backdrop-blur-md',
            colorMap[color],
          )}
        >
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}
