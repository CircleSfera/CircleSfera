import { ChevronLeft, ChevronRight, Trash2, Type, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FRAME_MAX_DURATION_SEC,
  FRAME_MIN_DURATION_SEC,
} from '../../constants/uploadLimits';
import type { StoryElement } from '../../types';
import BrandAmbientBackground from '../common/BrandAmbientBackground';
import {
  CREATE_FULL_SCREEN,
  CREATE_GLASS_ICON,
  CREATE_PRIMARY,
} from './createStyles';
import { formatClipClock } from './FrameClipControls';
import {
  clipsLength,
  clipsMakeAFrame,
  type FrameClip,
  moveClip,
  trimClip,
} from './frameClips';

const StoryComposer = lazy(() => import('../story/StoryComposer'));

export interface FrameClipsEditorProps {
  clips: FrameClip[];
  /** The clips, and what is painted over them all when there is any. */
  onDone: (clips: FrameClip[], layer: Blob | null) => void;
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
  onDone,
  onCancel,
}: FrameClipsEditorProps) {
  const { t } = useTranslation();
  const [clips, setClips] = useState(recorded);
  const [chosen, setChosen] = useState(0);
  const clip = clips[Math.min(chosen, clips.length - 1)];
  const videoRef = useRef<HTMLVideoElement>(null);
  // Text and drawing over the whole Frame, painted on its first clip.
  const [painting, setPainting] = useState(false);
  const [layer, setLayer] = useState<Blob | null>(null);
  const painted = useRef<StoryElement[]>([]);

  // One address per file, let go when the editor closes.
  const urls = useMemo(
    () => new Map(recorded.map((c) => [c.file, URL.createObjectURL(c.file)])),
    [recorded],
  );
  useEffect(
    () => () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
    [urls],
  );

  // The chosen clip plays its window, over and over.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip) return;
    video.currentTime = clip.startMs / 1000;
    const loop = () => {
      if (video.currentTime * 1000 >= clip.endMs) {
        video.currentTime = clip.startMs / 1000;
      }
    };
    video.addEventListener('timeupdate', loop);
    return () => video.removeEventListener('timeupdate', loop);
  }, [clip]);

  const total = clipsLength(clips);
  const ready = clipsMakeAFrame(clips);
  const update = (next: FrameClip) =>
    setClips((all) => all.map((c, i) => (i === chosen ? next : c)));

  return (
    <div
      className={`${CREATE_FULL_SCREEN} flex flex-col text-white`}
      data-testid="frame-clips-editor"
    >
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
          onClick={() => onDone(clips, layer)}
          disabled={!ready}
          className={`${CREATE_PRIMARY} min-h-11 px-5 disabled:opacity-40`}
        >
          {t('createPost.header.next')}
        </button>
      </div>

      <div className="relative flex justify-center px-4 pb-2">
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
            className="aspect-9/16 h-full max-h-full max-w-full rounded-2xl bg-black object-cover"
          />
        ) : null}
      </div>

      {!ready && total < FRAME_MIN_DURATION_SEC * 1000 ? (
        <p className="px-4 pt-2 text-center text-xs text-white/70">
          {t('story.capture.clips_min', { min: FRAME_MIN_DURATION_SEC })}
        </p>
      ) : null}

      {clip ? (
        <div className="relative space-y-2 px-4 pt-3">
          <label className="flex items-center gap-3 text-xs">
            <span className="w-14 shrink-0">{t('frames.clips.start')}</span>
            <input
              type="range"
              min={0}
              max={clip.ms}
              step={100}
              value={clip.startMs}
              onChange={(e) =>
                update(trimClip(clip, { startMs: Number(e.target.value) }))
              }
              className="h-11 flex-1"
            />
            <span className="w-10 text-right tabular-nums">
              {formatClipClock(clip.startMs / 1000)}
            </span>
          </label>
          <label className="flex items-center gap-3 text-xs">
            <span className="w-14 shrink-0">{t('frames.clips.end')}</span>
            <input
              type="range"
              min={0}
              max={clip.ms}
              step={100}
              value={clip.endMs}
              onChange={(e) =>
                update(trimClip(clip, { endMs: Number(e.target.value) }))
              }
              className="h-11 flex-1"
            />
            <span className="w-10 text-right tabular-nums">
              {formatClipClock(clip.endMs / 1000)}
            </span>
          </label>
        </div>
      ) : null}

      <div className="relative flex items-center gap-2 overflow-x-auto px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        {clips.map((c, index) => (
          <button
            key={urls.get(c.file)}
            type="button"
            onClick={() => setChosen(index)}
            aria-current={index === chosen ? 'true' : undefined}
            aria-label={t('frames.clips.item', {
              n: index + 1,
              total: clips.length,
            })}
            className={`relative h-16 w-11 shrink-0 overflow-hidden rounded-lg border-2 ${
              index === chosen ? 'border-brand-primary' : 'border-white/15'
            }`}
          >
            <video
              src={urls.get(c.file)}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setClips((all) => moveClip(all, chosen, -1));
              setChosen((i) => Math.max(0, i - 1));
            }}
            disabled={chosen === 0}
            aria-label={t('frames.clips.earlier')}
            className={`${CREATE_GLASS_ICON} disabled:opacity-30`}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              setClips((all) => moveClip(all, chosen, 1));
              setChosen((i) => Math.min(clips.length - 1, i + 1));
            }}
            disabled={chosen === clips.length - 1}
            aria-label={t('frames.clips.later')}
            className={`${CREATE_GLASS_ICON} disabled:opacity-30`}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
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
