import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FRAME_MAX_DURATION_SEC,
  FRAME_MIN_DURATION_SEC,
} from '../../constants/uploadLimits';
import type { StoryElement } from '../../types';
import BrandAmbientBackground from '../common/BrandAmbientBackground';
import { PHOTO_FILTERS } from '../photo-editor/photoEditor.constants';
import {
  CREATE_FULL_SCREEN,
  CREATE_GLASS_ICON,
  CREATE_PRIMARY,
} from './createStyles';
import { formatClipClock } from './FrameClipControls';
import FrameClipsOrder from './FrameClipsOrder';
import FrameClipTrimBar from './FrameClipTrimBar';
import FrameFilterPanel, {
  type FrameFilter,
  NO_FRAME_FILTER,
} from './FrameFilterPanel';
import {
  clipsLength,
  clipsMakeAFrame,
  type FrameClip,
  moveClipTo,
} from './frameClips';
import { frameLookCss, frameLookOf } from './frameLook';

const StoryComposer = lazy(() => import('../story/StoryComposer'));

/**
 * What goes over a Frame: the painted picture and what it is made of, and
 * the filter of the whole Frame.
 */
export interface FramePainting {
  layer: Blob | null;
  elements: StoryElement[];
  filter?: FrameFilter;
}

/** How far a finger moves across the video to change the filter, in px. */
const FILTER_SWIPE_PX = 48;
/** How long the name of a filter shows once chosen, in ms. */
const FILTER_NAME_MS = 900;

export interface FrameClipsEditorProps {
  clips: FrameClip[];
  /** What was painted before, when the editor opens again. */
  painting?: FramePainting;
  /** The clips, and what is painted over them all. */
  onDone: (clips: FrameClip[], painting: FramePainting) => void;
  onCancel: () => void;
}

/**
 * The clips of a Frame before it is put together: the one chosen plays in
 * the 9:16 frame between its start and end; the strip under it orders them
 * and takes one out; two sliders trim the one chosen. "Next" is on once the
 * clips together make a Frame.
 */
export default function FrameClipsEditor({
  clips: recorded,
  painting: before,
  onDone,
  onCancel,
}: FrameClipsEditorProps) {
  const { t } = useTranslation();
  const [clips, setClips] = useState(recorded);
  const [chosen, setChosen] = useState(0);
  const clip = clips[Math.min(chosen, clips.length - 1)];
  const videoRef = useRef<HTMLVideoElement>(null);
  // The trim bar is as wide as the video above it.
  const [previewPx, setPreviewPx] = useState(0);
  const shownFile = clip?.file;
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shownFile) return;
    const measure = () => setPreviewPx(video.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(video);
    return () => observer.disconnect();
  }, [shownFile]);
  // Text and drawing over the whole Frame, painted on its first clip.
  const [painting, setPainting] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [layer, setLayer] = useState<Blob | null>(before?.layer ?? null);
  const painted = useRef<StoryElement[]>(before?.elements ?? []);
  // One filter for the whole Frame, as on Reels: a strip to choose it, or a
  // swipe across the video; its name shows for a moment.
  const [filter, setFilter] = useState<FrameFilter>(
    before?.filter ?? NO_FRAME_FILTER,
  );
  const [choosingFilter, setChoosingFilter] = useState(false);
  const [filterName, setFilterName] = useState<string | null>(null);
  useEffect(() => {
    if (!filterName) return;
    const timer = setTimeout(() => setFilterName(null), FILTER_NAME_MS);
    return () => clearTimeout(timer);
  }, [filterName]);
  const swipeFrom = useRef<number | null>(null);
  const swipeFilter = (by: 1 | -1) => {
    const at = PHOTO_FILTERS.findIndex((f) => f.class === filter.filterClass);
    const next =
      PHOTO_FILTERS[
        (Math.max(at, 0) + by + PHOTO_FILTERS.length) % PHOTO_FILTERS.length
      ];
    setFilter({ ...NO_FRAME_FILTER, filterClass: next.class });
    setFilterName(next.name);
  };
  const lookCss = frameLookCss(
    frameLookOf(filter.filterClass, filter.strength),
  );

  // One address per file, let go when the editor closes.
  // Made and let go together, so a second run of the effect makes them
  // again rather than keeping ones already let go.
  const [urls, setUrls] = useState<Map<File, string>>(() => new Map());
  useEffect(() => {
    const made = new Map(
      recorded.map((c) => [c.file, URL.createObjectURL(c.file)]),
    );
    setUrls(made);
    return () => {
      for (const url of made.values()) URL.revokeObjectURL(url);
    };
  }, [recorded]);

  // The chosen clip plays its window, over and over; the timeline marks
  // where it is.
  const [playheadMs, setPlayheadMs] = useState<number | undefined>(undefined);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip) return;
    video.currentTime = clip.startMs / 1000;
    const loop = () => {
      const at = video.currentTime * 1000;
      if (at >= clip.endMs || at < clip.startMs) {
        video.currentTime = clip.startMs / 1000;
      }
      setPlayheadMs(Math.min(Math.max(at, clip.startMs), clip.endMs));
    };
    video.addEventListener('timeupdate', loop);
    return () => video.removeEventListener('timeupdate', loop);
  }, [clip]);

  const total = clipsLength(clips);
  const ready = clipsMakeAFrame(clips);
  const trim = (index: number, next: FrameClip) =>
    setClips((all) => all.map((c, i) => (i === index ? next : c)));

  return (
    <div
      className={`${CREATE_FULL_SCREEN} flex flex-col text-white`}
      data-testid="frame-clips-editor"
    >
      {ordering ? (
        <FrameClipsOrder
          clips={clips}
          onMove={(from, to) => {
            const moved = clips[from];
            const shown = clips[chosen];
            const next = moveClipTo(clips, from, to);
            setClips(next);
            // The clip shown stays the one shown, wherever it went.
            setChosen(Math.max(0, next.indexOf(shown ?? moved)));
          }}
          onDone={() => setOrdering(false)}
        />
      ) : null}
      {painting && clips[0] ? (
        <Suspense fallback={null}>
          <StoryComposer
            initialMedia={clips[0].file}
            bgStyle=""
            paintOnly
            elements={painted.current}
            onElementsChange={(elements) => {
              painted.current = elements;
            }}
            onClose={() => setPainting(false)}
            onPost={(blob) => {
              // Nothing painted is no layer at all.
              setLayer(painted.current.length > 0 ? blob : null);
              setPainting(false);
            }}
          />
        </Suspense>
      ) : null}
      <BrandAmbientBackground placement="story" />
      <div className="relative flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('common.close')}
          className={CREATE_GLASS_ICON}
        >
          <X size={20} aria-hidden />
        </button>
        <p className="text-sm font-semibold tabular-nums" role="status">
          {t('frames.clips.total', {
            length: formatClipClock(total / 1000),
            max: formatClipClock(FRAME_MAX_DURATION_SEC),
          })}
        </p>
        <button
          type="button"
          onClick={() =>
            onDone(clips, {
              layer,
              elements: layer ? painted.current : [],
              filter,
            })
          }
          disabled={!ready}
          className={`${CREATE_PRIMARY} min-h-11 px-5 disabled:opacity-40`}
        >
          {t('createPost.header.next')}
        </button>
      </div>

      <div className="relative flex justify-center gap-3 px-4 pb-2">
        <button
          type="button"
          onClick={() => setPainting(true)}
          className={`${CREATE_GLASS_ICON} w-auto! gap-1.5 px-4`}
        >
          <Type size={16} aria-hidden />
          <span className="text-sm font-semibold">
            {layer ? t('frames.clips.paint_edit') : t('frames.clips.paint')}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setChoosingFilter((open) => !open)}
          aria-pressed={choosingFilter}
          className={`${CREATE_GLASS_ICON} w-auto! gap-1.5 px-4`}
        >
          <Sparkles size={16} aria-hidden />
          <span className="text-sm font-semibold">
            {t('frames.clips.filters')}
          </span>
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        {clip ? (
          <video
            ref={videoRef}
            key={urls.get(clip.file)}
            src={urls.get(clip.file)}
            autoPlay
            muted
            playsInline
            data-testid="frame-clips-video"
            style={{ filter: lookCss }}
            onPointerDown={(event) => {
              swipeFrom.current = event.clientX;
            }}
            onPointerUp={(event) => {
              const from = swipeFrom.current;
              swipeFrom.current = null;
              if (from === null) return;
              const moved = event.clientX - from;
              if (Math.abs(moved) >= FILTER_SWIPE_PX) {
                swipeFilter(moved < 0 ? 1 : -1);
              }
            }}
            className="aspect-9/16 h-full max-h-full max-w-full touch-pan-y rounded-2xl bg-black object-cover"
          />
        ) : null}
        {filterName ? (
          <p
            className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-2xl font-bold drop-shadow-lg"
            role="status"
          >
            {filterName}
          </p>
        ) : null}
      </div>

      {!ready && total < FRAME_MIN_DURATION_SEC * 1000 ? (
        <p className="px-4 pt-2 text-center text-xs text-white/70">
          {t('story.capture.clips_min', { min: FRAME_MIN_DURATION_SEC })}
        </p>
      ) : null}

      <div className="relative mx-auto w-full max-w-xl pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        {choosingFilter && clips[0] ? (
          <div
            className="mx-auto"
            style={previewPx > 0 ? { maxWidth: previewPx + 32 } : undefined}
          >
            <FrameFilterPanel
              clip={clips[0]}
              filter={filter}
              onChange={(next) => {
                setFilter(next);
                // The name shows for a swipe; the strip already names it.
                setFilterName(null);
              }}
              onDone={() => setChoosingFilter(false)}
            />
          </div>
        ) : null}
        {!choosingFilter && clips.length > 1 ? (
          <div className="flex flex-col items-center gap-1 px-4 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setChosen((i) => Math.max(0, i - 1))}
                disabled={chosen === 0}
                aria-label={t('frames.clips.previous')}
                className={`${CREATE_GLASS_ICON} disabled:opacity-30`}
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
              <p
                className="min-w-28 text-center text-sm font-semibold"
                aria-live="polite"
              >
                {t('frames.clips.item', {
                  n: chosen + 1,
                  total: clips.length,
                })}
              </p>
              <button
                type="button"
                onClick={() =>
                  setChosen((i) => Math.min(clips.length - 1, i + 1))
                }
                disabled={chosen === clips.length - 1}
                aria-label={t('frames.clips.next')}
                className={`${CREATE_GLASS_ICON} disabled:opacity-30`}
              >
                <ChevronRight size={20} aria-hidden />
              </button>
            </div>
            <div className="flex gap-1.5" aria-hidden>
              {clips.map((c, index) => (
                <span
                  key={urls.get(c.file)}
                  className={`h-1.5 rounded-full transition-all ${
                    index === chosen ? 'w-4 bg-white' : 'w-1.5 bg-white/35'
                  }`}
                />
              ))}
            </div>
          </div>
        ) : null}
        {!choosingFilter && clip ? (
          <div
            className="mx-auto px-4"
            style={previewPx > 0 ? { maxWidth: previewPx + 32 } : undefined}
          >
            <FrameClipTrimBar
              key={urls.get(clip.file)}
              clip={clip}
              playheadMs={playheadMs}
              onTrim={(next) => trim(chosen, next)}
            />
          </div>
        ) : null}
        <div
          className={`mx-auto flex items-center justify-between px-4 pt-3 ${choosingFilter ? 'hidden' : ''}`}
          style={previewPx > 0 ? { maxWidth: previewPx + 32 } : undefined}
        >
          {clips.length > 1 ? (
            <button
              type="button"
              onClick={() => setOrdering(true)}
              className={`${CREATE_GLASS_ICON} w-auto! gap-1.5 px-4`}
            >
              <ArrowUpDown size={16} aria-hidden />
              <span className="text-sm font-semibold">
                {t('frames.clips.order_button')}
              </span>
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => {
              setClips((all) => all.filter((_, i) => i !== chosen));
              setChosen((i) => Math.max(0, i - 1));
            }}
            disabled={clips.length === 1}
            aria-label={t('frames.clips.remove')}
            className={`${CREATE_GLASS_ICON} disabled:opacity-30`}
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
