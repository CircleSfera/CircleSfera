import { Image as ImageIcon, Music, Type, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { Clip, MediaClip } from '../../../types/studio';
import { trimmedClip } from '../../../utils/studioTimeline';
import { useClipThumbnail } from './useClipThumbnail';

/** How long a finger rests on a clip before it can be moved, in ms. */
export const HOLD_TO_MOVE_MS = 350;
/** How far a mouse moves a clip before it counts as moving it, in px. */
const MOUSE_MOVE_THRESHOLD_PX = 4;

const ICONS = {
  video: Video,
  image: ImageIcon,
  audio: Music,
  text: Type,
} as const;

const LAYER_COLORS: Record<string, string> = {
  text: 'bg-brand-accent/80',
  audio: 'bg-brand-primary/70',
};

interface TimelineClipProps {
  clip: Clip;
  zoom: number;
  /** On the main track a clip is moved to another place; on a layer, in time. */
  kind: 'main' | 'layer';
  locked?: boolean;
  /** Where a clip of the main track being moved would go, as it moves. */
  onMoving?: (clipId: string, timelineX: number | null) => void;
  onMoved?: (clipId: string, timelineX: number) => void;
}

function clipLabel(clip: Clip, t: (key: string) => string): string {
  if (clip.type === 'text') return clip.content;
  return t(`studio.clip_types.${clip.type}`);
}

export default function TimelineClip({
  clip,
  zoom,
  kind,
  locked = false,
  onMoving,
  onMoved,
}: TimelineClipProps) {
  const { t } = useTranslation();
  const selectedClipId = useStudioStore((s) => s.selectedClipId);
  const selectClip = useStudioStore((s) => s.selectClip);
  const updateClip = useStudioStore((s) => s.updateClip);
  const beginHistoryTransaction = useStudioStore(
    (s) => s.beginHistoryTransaction,
  );
  const thumbnail = useClipThumbnail(clip);
  const isSelected = selectedClipId === clip.id;

  const [offset, setOffset] = useState(0);
  const [moving, setMoving] = useState(false);
  const gesture = useRef<{
    pointerId: number;
    startX: number;
    original: Clip;
    edge: 'start' | 'end' | null;
    active: boolean;
    timer: number | null;
  } | null>(null);

  // A finger held on a clip moves it, so the timeline must not scroll then.
  useEffect(() => {
    if (!moving) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    window.addEventListener('touchmove', stop, { passive: false });
    return () => window.removeEventListener('touchmove', stop);
  }, [moving]);

  const begin = (e: React.PointerEvent, edge: 'start' | 'end' | null) => {
    if (locked || e.button > 0) return;
    e.stopPropagation();
    const state = {
      pointerId: e.pointerId,
      startX: e.clientX,
      original: clip,
      edge,
      active: false,
      timer: null as number | null,
    };
    gesture.current = state;
    const activate = () => {
      if (gesture.current !== state) return;
      state.active = true;
      beginHistoryTransaction();
      setMoving(true);
      selectClip(clip.id);
    };
    // An edge is taken at once; the clip itself by a held finger or a
    // mouse that moves it.
    if (edge) {
      e.currentTarget.setPointerCapture(e.pointerId);
      activate();
    } else if (e.pointerType === 'touch') {
      state.timer = window.setTimeout(() => {
        try {
          (e.target as Element).setPointerCapture?.(e.pointerId);
        } catch {
          // The finger may already be gone.
        }
        activate();
      }, HOLD_TO_MOVE_MS);
    }
  };

  const move = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.startX;
    if (!g.active) {
      if (e.pointerType === 'touch') {
        // Moving before the hold is up is scrolling the timeline.
        if (Math.abs(dx) > 8 && g.timer !== null) {
          window.clearTimeout(g.timer);
          gesture.current = null;
        }
        return;
      }
      if (Math.abs(dx) < MOUSE_MOVE_THRESHOLD_PX) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      g.active = true;
      beginHistoryTransaction();
      setMoving(true);
      selectClip(clip.id);
    }
    const seconds = dx / zoom;
    if (g.edge) {
      const trimmed = trimmedClip(g.original, g.edge, seconds);
      updateClip(clip.id, {
        startAt: trimmed.startAt,
        duration: trimmed.duration,
        ...(trimmed.type !== 'text'
          ? { mediaStart: (trimmed as MediaClip).mediaStart }
          : {}),
      } as Partial<Clip>);
    } else if (kind === 'layer') {
      updateClip(clip.id, {
        startAt: Math.max(0, g.original.startAt + seconds),
      });
    } else {
      setOffset(dx);
      onMoving?.(
        clip.id,
        (g.original.startAt + g.original.duration / 2) * zoom + dx,
      );
    }
  };

  const end = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (g.timer !== null) window.clearTimeout(g.timer);
    gesture.current = null;
    if (g.active && kind === 'main' && !g.edge) {
      onMoved?.(
        clip.id,
        (g.original.startAt + g.original.duration / 2) * zoom +
          (e.clientX - g.startX),
      );
      onMoving?.(clip.id, null);
    }
    setOffset(0);
    setMoving(false);
    if (!g.active) selectClip(isSelected ? null : clip.id);
  };

  const Icon = ICONS[clip.type as keyof typeof ICONS] ?? Video;
  const width = Math.max(clip.duration * zoom, 4);
  const background =
    kind === 'main'
      ? 'bg-surface-high'
      : (LAYER_COLORS[clip.type] ?? 'bg-surface-high');

  return (
    <div
      data-studio-clip={clip.id}
      className={`absolute top-0 bottom-0 ${moving ? 'z-30' : isSelected ? 'z-20' : 'z-10'}`}
      style={{
        left: `${clip.startAt * zoom}px`,
        width: `${width}px`,
        transform: offset ? `translateX(${offset}px) scale(1.04)` : undefined,
      }}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        aria-label={`${clipLabel(clip, t)}, ${clip.duration.toFixed(1)} s`}
        onPointerDown={(e) => begin(e, null)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectClip(isSelected ? null : clip.id);
          }
        }}
        className={`absolute inset-y-0 left-px right-px overflow-hidden rounded-lg text-left ${background} ${
          isSelected ? 'ring-2 ring-white' : 'ring-1 ring-white/10'
        } ${locked ? 'opacity-50' : ''} ${moving ? 'shadow-2xl' : ''}`}
        style={{
          // A swipe scrolls the timeline; a held finger moves the clip.
          touchAction: 'pan-x',
          backgroundImage: thumbnail ? `url("${thumbnail}")` : undefined,
          backgroundSize: thumbnail ? 'auto 100%' : undefined,
          backgroundRepeat: 'repeat-x',
        }}
      >
        <span className="absolute inset-0 flex items-center gap-1.5 px-2 bg-linear-to-r from-black/40 to-transparent pointer-events-none">
          <Icon size={12} className="shrink-0 text-white" aria-hidden />
          {(kind === 'layer' || !thumbnail) && (
            <span className="truncate text-xs font-semibold text-white drop-shadow">
              {clipLabel(clip, t)}
            </span>
          )}
        </span>
        {clip.type !== 'text' && (clip as MediaClip).speed !== 1 && (
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-xs font-bold text-white pointer-events-none">
            {(clip as MediaClip).speed}×
          </span>
        )}
      </button>

      {isSelected && !locked && (
        <>
          {/* Each handle reaches 44 px wide for a finger, half outside the
              clip; what shows is the white edge outside it. */}
          <button
            type="button"
            aria-label={t('studio.trim_start')}
            onPointerDown={(e) => begin(e, 'start')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className="absolute -left-5.5 inset-y-0 w-11 flex justify-start cursor-ew-resize touch-none"
          >
            <span className="ml-0.5 h-full w-5 rounded-l-lg bg-white flex items-center justify-center">
              <span className="h-4 w-0.5 rounded-full bg-black/60" />
            </span>
          </button>
          <button
            type="button"
            aria-label={t('studio.trim_end')}
            onPointerDown={(e) => begin(e, 'end')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className="absolute -right-5.5 inset-y-0 w-11 flex justify-end cursor-ew-resize touch-none"
          >
            <span className="mr-0.5 h-full w-5 rounded-r-lg bg-white flex items-center justify-center">
              <span className="h-4 w-0.5 rounded-full bg-black/60" />
            </span>
          </button>
        </>
      )}
    </div>
  );
}
