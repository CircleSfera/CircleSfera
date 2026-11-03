import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatClipClock } from './FrameClipControls';
import { type FrameClip, trimClip } from './frameClips';
import {
  dropIndex,
  msForPx,
  TIMELINE_FRAME_PX,
  TIMELINE_HOLD_MS,
  TIMELINE_HOLD_SLOP_PX,
  TIMELINE_KEY_STEP_MS,
  TIMELINE_PX_PER_SEC,
  timelineWidth,
} from './frameTimeline';
import { useFilmstrip } from './useFilmstrip';

export interface FrameClipsTimelineProps {
  clips: FrameClip[];
  chosen: number;
  /** Where the chosen clip is playing, in ms from its beginning. */
  playheadMs?: number;
  onChoose: (index: number) => void;
  onTrim: (index: number, clip: FrameClip) => void;
  onMove: (from: number, to: number) => void;
  /** Buttons on the row under the strip, at its end. */
  actions?: ReactNode;
}

const pxFor = (ms: number) => (ms / 1000) * TIMELINE_PX_PER_SEC;

/** A clip's frames, along its whole length, `offsetMs` cut from its start. */
function Strip({
  clip,
  url,
  offsetMs,
}: {
  clip: FrameClip;
  url: string;
  offsetMs: number;
}) {
  const fullPx = Math.max(pxFor(clip.ms), TIMELINE_FRAME_PX);
  const frames = useFilmstrip(
    clip.file,
    clip.ms,
    Math.ceil(fullPx / TIMELINE_FRAME_PX),
  );
  return (
    <div
      className="absolute inset-y-0 left-0 flex"
      style={{ width: fullPx, transform: `translateX(${-pxFor(offsetMs)}px)` }}
      aria-hidden
    >
      {frames.length > 0 ? (
        frames.map((frame, i) => (
          <img
            // biome-ignore lint/suspicious/noArrayIndexKey: the frames of a clip never move
            key={i}
            src={frame}
            alt=""
            draggable={false}
            className="h-full shrink-0 object-cover"
            style={{ width: TIMELINE_FRAME_PX }}
          />
        ))
      ) : (
        <video
          src={url}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

/**
 * The clips of a Frame in a strip, each as wide as it lasts, with its
 * frames. The chosen one shows its whole length, the parts cut off dimmed,
 * with a handle at each end to trim it; a line marks what is playing.
 * Holding a clip lifts it to be dragged to another place.
 */
export default function FrameClipsTimeline({
  clips,
  chosen,
  playheadMs,
  onChoose,
  onTrim,
  onMove,
  actions,
}: FrameClipsTimelineProps) {
  const { t } = useTranslation();
  const items = useRef<Array<HTMLLIElement | null>>([]);
  const hold = useRef<{
    index: number;
    x: number;
    y: number;
    timer: number;
  } | null>(null);
  const dragged = useRef(false);
  const [drag, setDrag] = useState<{
    from: number;
    startX: number;
    x: number;
    to: number;
  } | null>(null);
  const urls = useRef(new Map<File, string>());
  useEffect(() => {
    const made = urls.current;
    return () => {
      for (const url of made.values()) URL.revokeObjectURL(url);
    };
  }, []);
  const urlOf = (file: File) => {
    let url = urls.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      urls.current.set(file, url);
    }
    return url;
  };

  const middles = () =>
    items.current.slice(0, clips.length).map((item) => {
      const box = item?.getBoundingClientRect();
      return box ? box.left + box.width / 2 : 0;
    });

  const endHold = () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  };

  const trimHandle = (index: number, edge: 'start' | 'end') => {
    const clip = clips[index];
    const value = edge === 'start' ? clip.startMs : clip.endMs;
    const set = (ms: number) =>
      onTrim(
        index,
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
          e.stopPropagation();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          const from = { x: e.clientX, value };
          const move = (ev: PointerEvent) =>
            set(from.value + msForPx(ev.clientX - from.x));
          const target = e.currentTarget;
          target.addEventListener('pointermove', move);
          target.addEventListener(
            'pointerup',
            () => target.removeEventListener('pointermove', move),
            { once: true },
          );
        }}
        // The handle is narrow; its touch area reaches 44 px.
        className={`absolute inset-y-0 z-10 w-4 cursor-ew-resize touch-none bg-white before:absolute before:-inset-x-3.5 before:content-[''] ${
          edge === 'start' ? 'rounded-l-xl' : 'rounded-r-xl'
        } flex items-center justify-center focus-visible:outline-2 focus-visible:outline-brand-primary`}
        style={{
          left: edge === 'start' ? pxFor(value) - 16 : pxFor(value),
        }}
      >
        <span className="h-5 w-0.5 rounded-full bg-black/60" aria-hidden />
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div
        className="overflow-x-auto overscroll-x-contain py-1"
        style={{ touchAction: drag ? 'none' : 'pan-x' }}
      >
        <ol className="flex w-max items-start gap-3 px-4">
          {clips.map((clip, index) => {
            const isChosen = index === chosen;
            const width = isChosen
              ? Math.max(pxFor(clip.ms), timelineWidth(0))
              : timelineWidth(clip.endMs - clip.startMs);
            const lifted = drag?.from === index;
            return (
              <li
                key={urlOf(clip.file)}
                ref={(item) => {
                  items.current[index] = item;
                }}
                className={`relative flex shrink-0 flex-col gap-1.5 ${
                  drag && drag.to === index && drag.from !== index
                    ? drag.to < drag.from
                      ? 'border-l-2 border-brand-primary pl-1'
                      : 'border-r-2 border-brand-primary pr-1'
                    : ''
                }`}
                style={{
                  width,
                  marginLeft: isChosen ? 16 : undefined,
                  marginRight: isChosen ? 16 : undefined,
                  transform: lifted
                    ? `translateX(${drag.x - drag.startX}px) scale(1.06)`
                    : undefined,
                  zIndex: lifted ? 20 : undefined,
                }}
              >
                <div className="relative h-16">
                  <button
                    type="button"
                    aria-label={t('frames.clips.item', {
                      n: index + 1,
                      total: clips.length,
                    })}
                    aria-current={isChosen ? 'true' : undefined}
                    aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight"
                    onClick={() => {
                      if (dragged.current) {
                        dragged.current = false;
                        return;
                      }
                      onChoose(index);
                    }}
                    onKeyDown={(e) => {
                      if (!e.shiftKey) return;
                      if (e.key === 'ArrowLeft') onMove(index, index - 1);
                      else if (e.key === 'ArrowRight') onMove(index, index + 1);
                      else return;
                      e.preventDefault();
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      const target = e.currentTarget;
                      const pointerId = e.pointerId;
                      hold.current = {
                        index,
                        x: e.clientX,
                        y: e.clientY,
                        timer: window.setTimeout(() => {
                          target.setPointerCapture?.(pointerId);
                          dragged.current = true;
                          setDrag({
                            from: index,
                            startX: hold.current?.x ?? 0,
                            x: hold.current?.x ?? 0,
                            to: index,
                          });
                          hold.current = null;
                        }, TIMELINE_HOLD_MS),
                      };
                    }}
                    onPointerMove={(e) => {
                      if (drag) {
                        const to = dropIndex(middles(), e.clientX, drag.from);
                        setDrag({ ...drag, x: e.clientX, to });
                        return;
                      }
                      const start = hold.current;
                      if (
                        start &&
                        Math.hypot(e.clientX - start.x, e.clientY - start.y) >
                          TIMELINE_HOLD_SLOP_PX
                      ) {
                        endHold();
                      }
                    }}
                    onPointerUp={() => {
                      endHold();
                      if (drag) {
                        if (drag.to !== drag.from) onMove(drag.from, drag.to);
                        setDrag(null);
                      }
                    }}
                    onPointerCancel={() => {
                      endHold();
                      setDrag(null);
                    }}
                    className={`absolute inset-0 select-none overflow-hidden rounded-xl bg-white/10 transition-[opacity,box-shadow] ${
                      lifted
                        ? 'shadow-2xl ring-2 ring-white'
                        : isChosen
                          ? ''
                          : 'opacity-70'
                    }`}
                  >
                    <Strip
                      clip={clip}
                      url={urlOf(clip.file)}
                      offsetMs={isChosen ? 0 : clip.startMs}
                    />
                    {isChosen ? (
                      <>
                        {/* The parts cut off. */}
                        <span
                          className="absolute inset-y-0 left-0 bg-black/60"
                          style={{ width: pxFor(clip.startMs) }}
                          aria-hidden
                        />
                        <span
                          className="absolute inset-y-0 right-0 bg-black/60"
                          style={{ width: pxFor(clip.ms - clip.endMs) }}
                          aria-hidden
                        />
                        <span
                          className="absolute inset-y-0 border-y-2 border-white"
                          style={{
                            left: pxFor(clip.startMs),
                            width: pxFor(clip.endMs - clip.startMs),
                          }}
                          aria-hidden
                        />
                        {playheadMs !== undefined ? (
                          <span
                            className="absolute -inset-y-1 w-0.5 rounded-full bg-white shadow"
                            style={{ left: pxFor(playheadMs) }}
                            aria-hidden
                          />
                        ) : null}
                      </>
                    ) : null}
                  </button>
                  {isChosen ? (
                    <>
                      {trimHandle(index, 'start')}
                      {trimHandle(index, 'end')}
                    </>
                  ) : null}
                </div>
                <span
                  className={`text-center text-xs tabular-nums ${
                    isChosen ? 'font-semibold text-white' : 'text-white/60'
                  }`}
                >
                  {formatClipClock((clip.endMs - clip.startMs) / 1000)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3 px-4">
        <p className="text-xs text-white/60">
          {t('frames.clips.hold_to_move')}
        </p>
        {actions}
      </div>
    </div>
  );
}
