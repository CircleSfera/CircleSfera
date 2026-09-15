import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clampFrameWindow,
  FRAME_DURATION_PRESETS,
  type FrameClipWindow,
  frameClipLength,
} from '../../utils/frameClip';

export function formatClipClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

interface FrameClipControlsProps {
  sourceDurationSec: number;
  window: FrameClipWindow;
  onChange: (next: FrameClipWindow) => void;
  /** When true, show 15/30/60/90 chips and clamp to Frame range. */
  showPresets?: boolean;
  compact?: boolean;
}

/**
 * Shared clip window UI: optional duration chips + start-position track.
 * Used by FrameTrimOverlay and PhotoEditor TRIM.
 */
export default function FrameClipControls({
  sourceDurationSec,
  window: clipWindow,
  onChange,
  showPresets = true,
  compact = false,
}: FrameClipControlsProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    originX: number;
    originStart: number;
  } | null>(null);

  const length = frameClipLength(clipWindow);
  const maxStart = Math.max(0, sourceDurationSec - length);

  const activePreset = useMemo(() => {
    const rounded = Math.round(length);
    return FRAME_DURATION_PRESETS.find((p) => p === rounded) ?? null;
  }, [length]);

  const applyLength = (nextLength: number) => {
    onChange(
      clampFrameWindow(sourceDurationSec, clipWindow.startTime, nextLength),
    );
  };

  const applyStart = (nextStart: number) => {
    onChange(
      clampFrameWindow(
        sourceDurationSec,
        nextStart,
        frameClipLength(clipWindow),
      ),
    );
  };

  const clientXToStart = (clientX: number) => {
    const el = trackRef.current;
    if (!el || sourceDurationSec <= 0) return clipWindow.startTime;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * sourceDurationSec;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (maxStart <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = clientXToStart(e.clientX);
    applyStart(next);
    dragRef.current = {
      pointerId: e.pointerId,
      originX: e.clientX,
      originStart: clampFrameWindow(sourceDurationSec, next, length).startTime,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const el = trackRef.current;
    if (!el || sourceDurationSec <= 0) return;
    const rect = el.getBoundingClientRect();
    const deltaRatio = (e.clientX - drag.originX) / rect.width;
    applyStart(drag.originStart + deltaRatio * sourceDurationSec);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  };

  const selectionLeftPct =
    sourceDurationSec > 0
      ? (clipWindow.startTime / sourceDurationSec) * 100
      : 0;
  const selectionWidthPct =
    sourceDurationSec > 0 ? (length / sourceDurationSec) * 100 : 100;

  return (
    <div className={`w-full ${compact ? 'space-y-2' : 'space-y-3'}`}>
      {showPresets ? (
        <>
          <p
            className={`text-white/55 text-center ${compact ? 'text-[11px]' : 'text-xs'}`}
          >
            {t('createPost.frameTrim.hint', { min: 15, max: 90 })}
          </p>
          <fieldset className="flex gap-1.5 justify-center border-0 m-0 p-0 min-w-0">
            <legend className="sr-only">
              {t('createPost.frameTrim.presets')}
            </legend>
            {FRAME_DURATION_PRESETS.map((preset) => {
              const disabled = preset > sourceDurationSec + 0.05;
              const isActive = activePreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  disabled={disabled}
                  onClick={() => applyLength(preset)}
                  className={`min-h-9 min-w-9 px-2.5 rounded-full text-[11px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-35 disabled:cursor-not-allowed ${
                    isActive
                      ? 'bg-brand-primary text-white'
                      : 'bg-white/8 text-white/70 hover:bg-white/12'
                  }`}
                  aria-pressed={isActive}
                >
                  {t('createPost.frameTrim.preset_seconds', {
                    seconds: preset,
                  })}
                </button>
              );
            })}
          </fieldset>
        </>
      ) : null}

      <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
        <div className="flex justify-between text-[11px] font-bold text-white/50">
          <span>{formatClipClock(clipWindow.startTime)}</span>
          <span>
            {t('createPost.edit.trim_label', { seconds: length.toFixed(1) })}
          </span>
          <span>{formatClipClock(clipWindow.endTime)}</span>
        </div>

        <div
          ref={trackRef}
          role="slider"
          tabIndex={maxStart <= 0 ? -1 : 0}
          aria-label={t('createPost.frameTrim.slider')}
          aria-valuemin={0}
          aria-valuemax={maxStart}
          aria-valuenow={clipWindow.startTime}
          aria-valuetext={t('createPost.frameTrim.range', {
            start: formatClipClock(clipWindow.startTime),
            end: formatClipClock(clipWindow.endTime),
          })}
          aria-disabled={maxStart <= 0}
          onKeyDown={(e) => {
            if (maxStart <= 0) return;
            const step = e.shiftKey ? 1 : 0.25;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              applyStart(clipWindow.startTime - step);
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              applyStart(clipWindow.startTime + step);
            } else if (e.key === 'Home') {
              e.preventDefault();
              applyStart(0);
            } else if (e.key === 'End') {
              e.preventDefault();
              applyStart(maxStart);
            }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`relative ${compact ? 'h-11' : 'h-12'} rounded-lg bg-neutral-950/80 border border-white/8 overflow-hidden touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 ${
            maxStart <= 0 ? 'cursor-default opacity-70' : 'cursor-ew-resize'
          }`}
        >
          <div
            className="absolute inset-0 bg-white/5"
            aria-hidden
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, transparent, transparent 7px, rgba(255,255,255,0.06) 7px, rgba(255,255,255,0.06) 8px)',
            }}
          />
          <div
            className="absolute inset-y-0 pointer-events-none border-x-2 border-brand-primary bg-brand-primary/15"
            style={{
              left: `${selectionLeftPct}%`,
              width: `${selectionWidthPct}%`,
            }}
            aria-hidden
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-7 rounded-full bg-white shadow" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-1.5 h-7 rounded-full bg-white shadow" />
          </div>
        </div>
      </div>
    </div>
  );
}
