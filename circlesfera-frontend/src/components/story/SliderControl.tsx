import type { ElementType } from 'react';

export default function SliderControl({
  icon: Icon,
  label,
  value,
  min,
  max,
  step,
  unit,
  format,
  centerValue,
  onChange,
  onDoubleClick,
}: {
  icon: ElementType;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  format?: (v: number) => string;
  /** Optional guide mark (e.g. scale 1×, rotation 0°) */
  centerValue?: number;
  onChange: (v: number) => void;
  onDoubleClick?: () => void;
}) {
  const pct =
    max === min
      ? 0
      : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const centerPct =
    centerValue === undefined || max === min
      ? null
      : Math.min(100, Math.max(0, ((centerValue - min) / (max - min)) * 100));
  const display = format ? format(value) : `${value}${unit}`;

  return (
    <div className="space-y-1 py-1 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={14} className="text-white/50 shrink-0" aria-hidden />
          <span className="text-xs font-semibold text-white/75 whitespace-nowrap">
            {label}
          </span>
        </div>
        <span className="shrink-0 min-w-11 text-center px-1.5 py-0.5 rounded-md bg-white/8 border border-white/12 text-[11px] font-mono font-bold tabular-nums text-white/85">
          {display}
        </span>
      </div>

      <div className="relative h-7 flex items-center">
        <div
          className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-white/15 overflow-hidden"
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-brand-primary transition-[width] duration-75"
            style={{ width: `${pct}%` }}
          />
        </div>
        {centerPct !== null && (
          <div
            className="pointer-events-none absolute z-[5] w-0.5 h-3 -translate-x-1/2 rounded-full bg-white/45"
            style={{ left: `${centerPct}%` }}
            aria-hidden
          />
        )}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number.parseFloat(e.target.value))}
          onDoubleClick={onDoubleClick}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={display}
          className="story-slider-overlay relative z-10 w-full h-7 cursor-pointer"
        />
      </div>

      <style>{`
        input[type="range"].story-slider-overlay {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          margin: 0;
        }
        input[type="range"].story-slider-overlay:focus {
          outline: none;
        }
        input[type="range"].story-slider-overlay:focus-visible::-webkit-slider-thumb {
          box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.35);
        }
        input[type="range"].story-slider-overlay::-webkit-slider-runnable-track {
          height: 6px;
          background: transparent;
          border: none;
        }
        input[type="range"].story-slider-overlay::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          margin-top: -6px;
          border-radius: 50%;
          background: var(--brand-primary);
          border: 2px solid #fff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
        }
        input[type="range"].story-slider-overlay::-moz-range-track {
          height: 6px;
          background: transparent;
          border: none;
        }
        input[type="range"].story-slider-overlay::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--brand-primary);
          border: 2px solid #fff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
        }
      `}</style>
    </div>
  );
}
