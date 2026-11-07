import { useRef } from 'react';
import { useStudioStore } from '../../../stores/studioStore';

interface StudioSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** How the value is shown beside the slider. */
  shown: string;
  onChange: (value: number) => void;
  /** A double tap puts it back here, in one step of undo. */
  resetTo?: number;
}

/**
 * A slider of the editor: one step of undo for each drag or held key, and
 * none for a touch that changes nothing.
 */
export default function StudioSlider({
  label,
  value,
  min,
  max,
  step,
  shown,
  onChange,
  resetTo,
}: StudioSliderProps) {
  const beginHistoryTransaction = useStudioStore(
    (s) => s.beginHistoryTransaction,
  );
  const changing = useRef(false);
  const settle = () => {
    changing.current = false;
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-sm text-white/70">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-white">{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerUp={settle}
        onKeyUp={settle}
        onBlur={settle}
        onDoubleClick={() => {
          if (resetTo === undefined || value === resetTo) return;
          beginHistoryTransaction();
          onChange(resetTo);
        }}
        onChange={(e) => {
          if (!changing.current) {
            changing.current = true;
            beginHistoryTransaction();
          }
          onChange(Number(e.target.value));
        }}
        className="h-11 w-full accent-white"
      />
    </label>
  );
}
