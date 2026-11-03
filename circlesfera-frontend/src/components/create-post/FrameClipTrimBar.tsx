import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatClipClock } from './FrameClipControls';
import { type FrameClip, trimClip } from './frameClips';
import {
  msForPx,
  TIMELINE_FRAME_PX,
  TIMELINE_KEY_STEP_MS,
} from './frameTimeline';
import { useFilmstrip } from './useFilmstrip';

/** The width of a trim handle, in px; its touch area reaches 44 px. */
const HANDLE_PX = 16;

export interface FrameClipTrimBarProps {
  clip: FrameClip;
  /** Where the clip is playing, in ms from its beginning. */
  playheadMs?: number;
  onTrim: (clip: FrameClip) => void;
}

/**
 * One clip across the whole width, drawn with its frames: the parts cut
 * off dimmed, a handle at each end of what is kept, and a line on what is
 * playing. Under it, where the part starts, how long it lasts and where it
 * ends.
 */
export default function FrameClipTrimBar({
  clip,
  playheadMs,
  onTrim,
}: FrameClipTrimBarProps) {
  const { t } = useTranslation();
  const bar = useRef<HTMLDivElement>(null);
  const [barPx, setBarPx] = useState(0);
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const measure = () => setBarPx(element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const frames = useFilmstrip(
    clip.file,
    clip.ms,
    Math.max(1, Math.ceil(barPx / TIMELINE_FRAME_PX)),
  );
  const at = (ms: number) => `${(ms / clip.ms) * 100}%`;

  const handle = (edge: 'start' | 'end') => {
    const value = edge === 'start' ? clip.startMs : clip.endMs;
    const set = (ms: number) =>
      onTrim(
        trimClip(clip, edge === 'start' ? { startMs: ms } : { endMs: ms }),
      );
    return (
      <div
        role="slider"
        tabIndex={0}
        aria-label={t(
          edge === 'start'
            ? 'frames.clips.trim_start'
            : 'frames.clips.trim_end',
        )}
        aria-valuemin={0}
        aria-valuemax={clip.ms}
        aria-valuenow={value}
        aria-valuetext={formatClipClock(value / 1000)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') set(value - TIMELINE_KEY_STEP_MS);
          else if (e.key === 'ArrowRight') set(value + TIMELINE_KEY_STEP_MS);
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          const from = { x: e.clientX, value };
          const width = bar.current?.clientWidth ?? barPx;
          const target = e.currentTarget;
          const move = (ev: PointerEvent) =>
            set(from.value + msForPx(ev.clientX - from.x, width, clip.ms));
          target.addEventListener('pointermove', move);
          target.addEventListener(
            'pointerup',
            () => target.removeEventListener('pointermove', move),
            { once: true },
          );
        }}
        className={`absolute inset-y-0 z-10 flex cursor-ew-resize touch-none items-center justify-center bg-white before:absolute before:-inset-x-3.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-brand-primary ${
          edge === 'start' ? 'rounded-l-xl' : 'rounded-r-xl'
        }`}
        style={{
          width: HANDLE_PX,
          left:
            edge === 'start'
              ? `calc(${at(value)} - ${HANDLE_PX}px)`
              : at(value),
        }}
      >
        <span className="h-5 w-0.5 rounded-full bg-black/60" aria-hidden />
      </div>
    );
  };

  return (
    <div className="space-y-2" style={{ paddingInline: HANDLE_PX }}>
      <div ref={bar} className="relative h-16">
        <div
          className="absolute inset-0 flex overflow-hidden rounded-xl bg-white/10"
          aria-hidden
        >
          {frames.map((frame, i) => (
            <img
              // biome-ignore lint/suspicious/noArrayIndexKey: the frames of a clip never move
              key={i}
              src={frame}
              alt=""
              draggable={false}
              className="h-full min-w-0 flex-1 object-cover"
            />
          ))}
        </div>
        {/* The parts cut off. */}
        <span
          className="absolute inset-y-0 left-0 rounded-l-xl bg-black/60"
          style={{ width: at(clip.startMs) }}
          aria-hidden
        />
        <span
          className="absolute inset-y-0 right-0 rounded-r-xl bg-black/60"
          style={{ width: at(clip.ms - clip.endMs) }}
          aria-hidden
        />
        <span
          className="absolute inset-y-0 border-y-2 border-white"
          style={{
            left: at(clip.startMs),
            width: at(clip.endMs - clip.startMs),
          }}
          aria-hidden
        />
        {playheadMs !== undefined ? (
          <span
            className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-white shadow"
            style={{ left: at(playheadMs) }}
            aria-hidden
          />
        ) : null}
        {handle('start')}
        {handle('end')}
      </div>
      <div className="flex items-center justify-between text-xs tabular-nums text-white/60">
        <span>{formatClipClock(clip.startMs / 1000)}</span>
        <span className="font-semibold text-white">
          {formatClipClock((clip.endMs - clip.startMs) / 1000)}
        </span>
        <span>{formatClipClock(clip.endMs / 1000)}</span>
      </div>
    </div>
  );
}
