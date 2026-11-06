import { ArrowRightLeft, Blend, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import { mainClips, mainTrackOf } from '../../../utils/studioTimeline';
import { transitionOf } from '../../../utils/studioTransitions';
import TimelineClip from './TimelineClip';

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 200;

/** The time marks of the ruler: one every so many seconds for the zoom. */
export function rulerStep(zoom: number): number {
  if (zoom >= 80) return 1;
  if (zoom >= 40) return 2;
  if (zoom >= 20) return 5;
  return 10;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

interface EditorTimelineProps {
  onAddMedia: () => void;
}

/**
 * The timeline. The playhead stays in the middle and the clips pass under
 * it: scrolling moves through the video. The main track holds the clips
 * that play one after another; texts and sounds lie on thin layers below,
 * one row each, shown only when there is something on them.
 */
export default function EditorTimeline({ onAddMedia }: EditorTimelineProps) {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const playhead = useStudioStore((s) => s.playhead);
  const zoom = useStudioStore((s) => s.zoom);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const setPlayhead = useStudioStore((s) => s.setPlayhead);
  const selectedCut = useStudioStore((s) => s.selectedCut);
  const selectCut = useStudioStore((s) => s.selectCut);
  const setPlaying = useStudioStore((s) => s.setPlaying);
  const setZoom = useStudioStore((s) => s.setZoom);
  const selectClip = useStudioStore((s) => s.selectClip);
  const moveClip = useStudioStore((s) => s.moveClip);

  const scrollRef = useRef<HTMLDivElement>(null);
  const settingScroll = useRef(false);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const [drop, setDrop] = useState<{ id: string; index: number } | null>(null);

  const ordered = useMemo(() => (project ? mainClips(project) : []), [project]);
  const main = project ? mainTrackOf(project) : undefined;
  const layers =
    project?.tracks.filter((tr) => tr !== main && tr.clips.length > 0) ?? [];
  const duration = project?.duration ?? 0;
  const mainEnd = ordered.length
    ? ordered[ordered.length - 1].startAt + ordered[ordered.length - 1].duration
    : 0;

  // The timeline follows the playhead: when it plays, or is moved from
  // elsewhere (the buttons, the keys, a cut).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = playhead * zoom;
    if (Math.abs(el.scrollLeft - target) > 0.5) {
      const before = el.scrollLeft;
      settingScroll.current = true;
      el.scrollLeft = target;
      // Already as far as it goes: no scroll follows, so nothing is to be
      // ignored.
      if (el.scrollLeft === before) settingScroll.current = false;
    }
  }, [playhead, zoom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (settingScroll.current) {
      settingScroll.current = false;
      return;
    }
    // Scrolling by hand takes the playhead with it, and stops the video.
    if (isPlaying) setPlaying(false);
    setPlayhead(Math.min(duration, el.scrollLeft / zoom));
  };

  // Zoom: two fingers, or the wheel with Control (a trackpad's pinch).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { zoom: z } = useStudioStore.getState();
      setZoom(Math.round(z * (e.deltaY < 0 ? 1.1 : 0.9)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  const fingersApart = (e: React.TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const indexAt = (clipId: string, x: number) => {
    const others = ordered.filter((c) => c.id !== clipId);
    let at = 0;
    for (const clip of others) {
      // Each other clip keeps its place unless the moved one passes its
      // middle.
      if (x > (clip.startAt + clip.duration / 2) * zoom) at += 1;
    }
    return at;
  };

  if (!project) return null;

  const step = rulerStep(zoom);
  const marks: number[] = [];
  for (let s = 0; s <= Math.max(duration, 1); s += step) marks.push(s);
  const width = Math.max(duration, mainEnd) * zoom;

  // Where the clip being moved would go: after the clips it has passed.
  const dropX = drop
    ? ordered
        .filter((c) => c.id !== drop.id)
        .slice(0, drop.index)
        .reduce((sum, c) => sum + c.duration, 0) * zoom
    : null;

  return (
    <div className="relative h-full min-h-0 select-none" data-studio-timeline>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            pinch.current = {
              distance: fingersApart(e),
              zoom: useStudioStore.getState().zoom,
            };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinch.current) {
            const ratio = fingersApart(e) / pinch.current.distance;
            setZoom(Math.round(pinch.current.zoom * ratio));
          }
        }}
        onTouchEnd={() => {
          pinch.current = null;
        }}
        className="h-full overflow-x-auto overflow-y-auto no-scrollbar overscroll-x-contain"
      >
        {/* Half the width on each side lets the start and the end reach the
            playhead in the middle. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a tap on an empty part of the timeline only lets go of the clip; the clips are buttons */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: as above; Escape lets go from the keyboard */}
        <div
          className="relative w-max py-1"
          style={{ paddingLeft: '50%', paddingRight: '50%' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) selectClip(null);
          }}
        >
          <div
            className="relative h-5 mb-1"
            style={{ width: `${width}px` }}
            aria-hidden
          >
            {marks.map((s) => (
              <span
                key={s}
                className="absolute top-0 -translate-x-1/2 text-xs font-mono text-white/40"
                style={{ left: `${s * zoom}px` }}
              >
                {formatClock(s)}
              </span>
            ))}
          </div>

          <div
            className="relative h-16"
            style={{ width: `${width}px` }}
            data-studio-main-track
          >
            {ordered.map((clip) => (
              <TimelineClip
                key={clip.id}
                clip={clip}
                zoom={zoom}
                kind="main"
                locked={main?.locked}
                onMoving={(id, x) =>
                  setDrop(x === null ? null : { id, index: indexAt(id, x) })
                }
                onMoved={(id, x) => {
                  moveClip(id, indexAt(id, x));
                  setDrop(null);
                }}
              />
            ))}
            {/* A button on every cut: the transition into the next clip. */}
            {ordered.slice(0, -1).map((clip, i) => {
              const next = ordered[i + 1];
              const transition = transitionOf(clip);
              const at = next.startAt + (transition?.duration ?? 0) / 2;
              const chosen = selectedCut === clip.id;
              return (
                <button
                  key={`cut-${clip.id}`}
                  type="button"
                  data-studio-cut={clip.id}
                  onClick={() => selectCut(chosen ? null : clip.id)}
                  aria-pressed={chosen}
                  aria-label={
                    transition
                      ? t('studio.transitions.cut_named', {
                          index: i + 1,
                          name: t(`studio.transitions.${transition.kind}`),
                        })
                      : t('studio.transitions.cut', { index: i + 1 })
                  }
                  className="absolute top-1/2 z-30 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                  style={{ left: `${at * zoom}px` }}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-md shadow ${
                      chosen
                        ? 'bg-brand-primary text-white'
                        : transition
                          ? 'bg-white text-brand-primary'
                          : 'bg-white text-black'
                    }`}
                  >
                    {transition ? (
                      <Blend size={14} aria-hidden />
                    ) : (
                      <ArrowRightLeft size={12} aria-hidden />
                    )}
                  </span>
                </button>
              );
            })}
            {dropX !== null && (
              <span
                className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-brand-primary z-40"
                style={{ left: `${dropX}px` }}
                aria-hidden
              />
            )}
            <button
              type="button"
              onClick={onAddMedia}
              aria-label={t('studio.add_media')}
              className={`absolute top-1/2 -translate-y-1/2 z-10 flex items-center justify-center rounded-xl bg-white text-black shadow-lg ${
                ordered.length
                  ? 'h-11 w-11'
                  : 'h-14 gap-2 px-4 text-sm font-bold'
              }`}
              style={{
                left: `${mainEnd * zoom + (ordered.length ? 12 : 0)}px`,
              }}
            >
              <Plus size={20} aria-hidden />
              {!ordered.length && (
                <span className="whitespace-nowrap">
                  {t('studio.add_media')}
                </span>
              )}
            </button>
          </div>

          {layers.map((track) => (
            <div
              key={track.id}
              className={`relative h-11 mt-1.5 ${track.hidden ? 'opacity-40' : ''}`}
              style={{ width: `${width}px` }}
              data-studio-layer={track.type}
            >
              {track.clips.map((clip) => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  zoom={zoom}
                  kind="layer"
                  layer={track.type}
                  locked={track.locked}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* The playhead: fixed in the middle. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center"
        aria-hidden
      >
        <span className="h-2 w-2 rounded-full bg-white" />
        <span className="w-0.5 flex-1 bg-white shadow-[0_0_8px_rgba(0,0,0,0.6)]" />
      </div>
    </div>
  );
}
