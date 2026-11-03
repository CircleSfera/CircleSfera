import { Trash2, Type, X } from 'lucide-react';
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
import FrameClipsTimeline from './FrameClipsTimeline';
import {
  clipsLength,
  clipsMakeAFrame,
  type FrameClip,
  moveClipTo,
} from './frameClips';

const StoryComposer = lazy(() => import('../story/StoryComposer'));

/** What is painted over a Frame: the picture and what it is made of. */
export interface FramePainting {
  layer: Blob | null;
  elements: StoryElement[];
}

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
  // Text and drawing over the whole Frame, painted on its first clip.
  const [painting, setPainting] = useState(false);
  const [layer, setLayer] = useState<Blob | null>(before?.layer ?? null);
  const painted = useRef<StoryElement[]>(before?.elements ?? []);

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
            })
          }
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

      <div className="relative mx-auto w-full max-w-xl pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        <FrameClipsTimeline
          clips={clips}
          chosen={Math.min(chosen, clips.length - 1)}
          playheadMs={playheadMs}
          onChoose={setChosen}
          onTrim={trim}
          onMove={(from, to) => {
            setClips((all) => moveClipTo(all, from, to));
            setChosen(Math.max(0, Math.min(clips.length - 1, to)));
          }}
          actions={
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
          }
        />
      </div>
    </div>
  );
}
