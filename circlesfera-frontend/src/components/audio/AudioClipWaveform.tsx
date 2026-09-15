import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { extractAudioPeaks } from '../../utils/audioWaveform';

interface AudioClipWaveformProps {
  url: string;
  seed?: string;
  trackDurationMs: number;
  windowMs: number;
  startMs: number;
  maxStartMs: number;
  disabled?: boolean;
  onStartMsChange: (next: number) => void;
  'aria-label'?: string;
}

const BAR_COUNT = 72;

export default function AudioClipWaveform({
  url,
  seed,
  trackDurationMs,
  windowMs,
  startMs,
  maxStartMs,
  disabled = false,
  onStartMsChange,
  'aria-label': ariaLabel,
}: AudioClipWaveformProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    originX: number;
    originStart: number;
  } | null>(null);

  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setPeaks(null);

    void extractAudioPeaks(url, {
      barCount: BAR_COUNT,
      seed: seed ?? url,
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setPeaks(result.peaks);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPeaks(null);
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [url, seed]);

  const clampStart = (value: number) =>
    Math.max(0, Math.min(maxStartMs, Math.round(value)));

  const clientXToStartMs = (clientX: number) => {
    const el = trackRef.current;
    if (!el || trackDurationMs <= 0) return startMs;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clampStart(ratio * trackDurationMs);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || maxStartMs <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = clientXToStartMs(e.clientX);
    onStartMsChange(next);
    dragRef.current = {
      pointerId: e.pointerId,
      originX: e.clientX,
      originStart: next,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const el = trackRef.current;
    if (!el || trackDurationMs <= 0) return;
    const rect = el.getBoundingClientRect();
    const deltaRatio = (e.clientX - drag.originX) / rect.width;
    const deltaMs = deltaRatio * trackDurationMs;
    onStartMsChange(clampStart(drag.originStart + deltaMs));
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  };

  const selectionLeftPct =
    trackDurationMs > 0 ? (startMs / trackDurationMs) * 100 : 0;
  const selectionWidthPct =
    trackDurationMs > 0 ? (windowMs / trackDurationMs) * 100 : 100;

  const bars = peaks ?? Array.from({ length: BAR_COUNT }, () => 0.2);

  return (
    <div className="space-y-2">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel || t('modals.audio.trim_slider')}
        aria-valuemin={0}
        aria-valuemax={maxStartMs}
        aria-valuenow={Math.min(startMs, maxStartMs)}
        aria-valuetext={t('modals.audio.trim_value', {
          start: Math.round(startMs / 1000),
          end: Math.round((startMs + windowMs) / 1000),
        })}
        aria-disabled={disabled || maxStartMs <= 0}
        onKeyDown={(e) => {
          if (disabled || maxStartMs <= 0) return;
          const step = e.shiftKey ? 1000 : 250;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            onStartMsChange(clampStart(startMs - step));
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onStartMsChange(clampStart(startMs + step));
          } else if (e.key === 'Home') {
            e.preventDefault();
            onStartMsChange(0);
          } else if (e.key === 'End') {
            e.preventDefault();
            onStartMsChange(maxStartMs);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative h-16 rounded-xl bg-neutral-950/80 border border-white/8 overflow-hidden touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 ${
          disabled || maxStartMs <= 0
            ? 'cursor-default opacity-70'
            : 'cursor-ew-resize'
        }`}
      >
        <div
          className="absolute inset-0 flex items-center gap-px px-1.5"
          aria-hidden
        >
          {bars.map((peak, i) => {
            const barStart = (i / bars.length) * trackDurationMs;
            const barEnd = ((i + 1) / bars.length) * trackDurationMs;
            const inSelection =
              barEnd > startMs && barStart < startMs + windowMs;
            return (
              <div
                key={`bar-${barStart.toFixed(0)}`}
                className={`flex-1 min-w-0 rounded-sm transition-colors ${
                  inSelection ? 'bg-brand-primary' : 'bg-neutral-600/70'
                } ${isLoading ? 'animate-pulse' : ''}`}
                style={{ height: `${Math.round(peak * 88)}%` }}
              />
            );
          })}
        </div>

        <div
          className="absolute inset-y-0 pointer-events-none border-x-2 border-brand-primary bg-brand-primary/10"
          style={{
            left: `${selectionLeftPct}%`,
            width: `${selectionWidthPct}%`,
          }}
          aria-hidden
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-8 rounded-full bg-white shadow" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-1.5 h-8 rounded-full bg-white shadow" />
        </div>

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/40">
            <span className="text-[11px] font-medium text-neutral-300">
              {t('modals.audio.waveform_loading')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
