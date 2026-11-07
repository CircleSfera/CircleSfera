import {
  Check,
  Images,
  Radio,
  Sparkles,
  SwitchCamera,
  Undo2,
  X,
  Zap,
  ZapOff,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FRAME_MAX_DURATION_SEC,
  FRAME_MIN_DURATION_SEC,
  POST_MAX_DURATION_SEC,
} from '../../../constants/uploadLimits';
import BrandAmbientBackground from '../../common/BrandAmbientBackground';
import { CREATE_FULL_SCREEN } from '../../create-post/createStyles';
import { BUTTON_STACK } from '../../ui/buttonWidth';
import { STORY_RECORD_MAX_SEC, useStoryCamera } from './useStoryCamera';

/** How long the shutter is held before it records instead of taking a photo. */
const HOLD_MS = 300;

const ROUND =
  'flex h-11 w-11 items-center justify-center rounded-full text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] hover:bg-white/10';

/** What the Create screen makes: the four formats, in the order shown. */
export const CAPTURE_MODES = ['POST', 'STORY', 'FRAME', 'LIVE'] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

/** The longest video each format records, in seconds. */
const RECORD_MAX_SEC: Record<Exclude<CaptureMode, 'LIVE'>, number> = {
  POST: POST_MAX_DURATION_SEC,
  STORY: STORY_RECORD_MAX_SEC,
  FRAME: FRAME_MAX_DURATION_SEC,
};

const MODE_LABEL: Record<CaptureMode, string> = {
  POST: 'story.capture.mode_post',
  STORY: 'story.capture.mode_story',
  FRAME: 'story.capture.mode_frame',
  LIVE: 'story.capture.mode_live',
};

/** A clip of a Frame as it was recorded, and how long it is in ms. */
export interface CapturedClip {
  file: File;
  ms: number;
}

export interface StoryCaptureProps {
  /** The format being made; a story when not given. */
  mode?: CaptureMode;
  /** Changing the format from the row of modes; no row without it. */
  onModeChange?: (mode: CaptureMode) => void;
  /** Live mode: on to the screen that starts the live. */
  onGoLive?: () => void;
  /** A post or a Frame where there is no camera at all. */
  onNoCamera?: () => void;
  /** A Frame recorded in clips: given, the Frame mode records clips. */
  onCaptureClips?: (clips: CapturedClip[]) => void;
  /** A photo taken or a video recorded, for the editor. */
  onCapture: (file: File) => void;
  /** The gallery of the device, or the file picker. */
  onOpenGallery: () => void;
  /** A text story on a background. */
  onCreate: () => void;
  onClose: () => void;
}

/**
 * Where creating starts: the camera fills the screen, with the formats along
 * the bottom. A tap on the shutter takes a photo and holding it records a
 * video; a Frame records with a tap and stops with another. The gallery is a
 * tap away, and a text story too, and they stay when there is no camera.
 */
export default function StoryCapture({
  mode = 'STORY',
  onModeChange,
  onGoLive,
  onNoCamera,
  onCaptureClips,
  onCapture,
  onOpenGallery,
  onCreate,
  onClose,
}: StoryCaptureProps) {
  const { t } = useTranslation();
  const camera = useStoryCamera();
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // The clips of a Frame recorded so far, in order, with how long each is.
  const [clips, setClips] = useState<CapturedClip[]>([]);
  const clipStartedAt = useRef(0);
  const clipsMode = mode === 'FRAME' && Boolean(onCaptureClips);
  const recordedMs = clips.reduce((sum, clip) => sum + clip.ms, 0);

  // How much of the longest video has been recorded, for the ring.
  useEffect(() => {
    if (!camera.recording) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    clipStartedAt.current = started;
    const timer = setInterval(() => setElapsed(Date.now() - started), 100);
    return () => clearInterval(timer);
  }, [camera.recording]);

  // Where there is no camera at all (often a computer), a post or a Frame
  // starts on the gallery, as it did before the camera came first.
  const picksFromGallery = mode === 'POST' || mode === 'FRAME';
  useEffect(() => {
    if (camera.state === 'none' && picksFromGallery) onNoCamera?.();
  }, [camera.state, picksFromGallery, onNoCamera]);

  const photo = async () => {
    const file = await camera.takePhoto();
    if (file) onCapture(file);
  };

  const recordMaxSec = mode === 'LIVE' ? 0 : RECORD_MAX_SEC[mode];
  const leftSec = Math.max(0, recordMaxSec - recordedMs / 1000);
  const record = () => {
    // A Frame in clips: each recording adds one, up to what is left of the
    // longest Frame.
    if (clipsMode) {
      if (leftSec <= 0) return;
      void camera.startRecording((file) => {
        if (!file) return;
        const ms = Math.min(Date.now() - clipStartedAt.current, leftSec * 1000);
        setClips((before) => [...before, { file, ms }]);
      }, leftSec);
      return;
    }
    void camera.startRecording((file) => {
      if (file) onCapture(file);
    }, recordMaxSec);
  };

  const onShutterDown = (e: React.PointerEvent) => {
    // While recording, the shutter stops it when let go.
    if (camera.state !== 'on' || camera.recording) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    holdRef.current = setTimeout(() => {
      holdRef.current = null;
      record();
    }, HOLD_MS);
  };

  const onShutterUp = () => {
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
      // A Frame is a video: a tap starts recording, the next one stops it.
      if (mode === 'FRAME') record();
      else void photo();
      return;
    }
    camera.stopRecording();
  };

  const onShutterKey = () => {
    if (mode !== 'FRAME') void photo();
    else if (camera.recording) camera.stopRecording();
    else record();
  };

  const live = camera.state === 'on' || camera.state === 'starting';
  const progress =
    recordMaxSec > 0
      ? Math.min(1, (recordedMs + elapsed) / (recordMaxSec * 1000))
      : 0;
  const hasClips = clipsMode && clips.length > 0;
  const enoughClips = recordedMs >= FRAME_MIN_DURATION_SEC * 1000;
  const isLive = mode === 'LIVE';
  const isStory = mode === 'STORY';
  const RING = 2 * Math.PI * 38;

  return (
    <div
      className={`${CREATE_FULL_SCREEN} flex flex-col text-white`}
      data-testid="story-capture"
    >
      {/* As behind the story editor: the brand's wash around the camera. */}
      <BrandAmbientBackground placement="story" />
      <div className="relative flex-1 min-h-0 md:flex md:items-center md:justify-center md:py-6">
        <div
          className={`absolute inset-0 overflow-hidden md:static md:inset-auto md:h-full md:aspect-9/16 ${
            live ? 'md:rounded-3xl md:border md:border-white/10' : ''
          }`}
        >
          {live ? (
            <video
              ref={camera.videoRef}
              autoPlay
              playsInline
              muted
              aria-hidden
              className={`h-full w-full object-cover ${
                camera.facing === 'user' ? '-scale-x-100' : ''
              }`}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
              <p role="status" className="max-w-xs text-sm text-white/70">
                {camera.state === 'refused'
                  ? t('story.capture.refused')
                  : t('story.capture.none')}
              </p>
              <div className={`${BUTTON_STACK}`}>
                {isLive ? (
                  <button
                    type="button"
                    onClick={onGoLive}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold hover:bg-white/15"
                  >
                    <Radio size={18} aria-hidden />
                    {t('story.capture.go_live')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenGallery}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold hover:bg-white/15"
                  >
                    <Images size={18} aria-hidden />
                    {t('story.capture.gallery')}
                  </button>
                )}
                {isStory ? (
                  <button
                    type="button"
                    onClick={onCreate}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold hover:bg-white/15"
                  >
                    <Sparkles size={18} aria-hidden />
                    {t('createPost.upload.create_text_story')}
                  </button>
                ) : null}
              </div>
            </div>
          )}
          {camera.state === 'starting' ? (
            <p
              role="status"
              className="absolute inset-x-0 top-1/2 text-center text-sm text-white/60"
            >
              {t('story.capture.starting')}
            </p>
          ) : null}
        </div>

        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),12px)]">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('story.capture.close')}
            className={ROUND}
          >
            <X size={26} aria-hidden />
          </button>
          <div className="flex items-center gap-1">
            {isStory && live ? (
              <button
                type="button"
                onClick={onCreate}
                aria-label={t('createPost.upload.create_text_story')}
                className={ROUND}
              >
                <Sparkles size={24} aria-hidden />
              </button>
            ) : null}
            {camera.hasTorch ? (
              <button
                type="button"
                onClick={() => void camera.toggleTorch()}
                aria-label={
                  camera.torchOn
                    ? t('story.capture.flash_off')
                    : t('story.capture.flash_on')
                }
                aria-pressed={camera.torchOn}
                className={ROUND}
              >
                {camera.torchOn ? (
                  <Zap size={24} aria-hidden />
                ) : (
                  <ZapOff size={24} aria-hidden />
                )}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        {/* Without a camera, the buttons above are all there is. */}
        {live ? (
          <div className="mx-auto flex max-w-sm items-center justify-between">
            {isLive ? (
              <span className="h-11 w-11" />
            ) : hasClips ? (
              <button
                type="button"
                onClick={() => setClips((before) => before.slice(0, -1))}
                disabled={camera.recording}
                aria-label={t('story.capture.clip_undo')}
                className={`${ROUND} disabled:opacity-40`}
              >
                <Undo2 size={24} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenGallery}
                aria-label={t('story.capture.gallery')}
                className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white/80 bg-white/10 hover:bg-white/20"
              >
                <Images size={20} aria-hidden />
              </button>
            )}

            {isLive ? (
              <button
                type="button"
                onClick={onGoLive}
                className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand-secondary px-6 text-sm font-bold text-white hover:opacity-90"
              >
                <Radio size={18} aria-hidden />
                {t('story.capture.go_live')}
              </button>
            ) : camera.state === 'on' ? (
              <button
                type="button"
                aria-label={
                  camera.recording
                    ? t('story.capture.recording')
                    : mode === 'FRAME'
                      ? t('story.capture.shutter_frame')
                      : t('story.capture.shutter')
                }
                onPointerDown={onShutterDown}
                onPointerUp={onShutterUp}
                onPointerCancel={onShutterUp}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onShutterKey();
                  }
                }}
                onContextMenu={(e) => e.preventDefault()}
                className="relative flex h-20 w-20 touch-none select-none items-center justify-center rounded-full"
              >
                <svg
                  viewBox="0 0 80 80"
                  className="absolute inset-0 -rotate-90"
                  aria-hidden
                >
                  <circle
                    cx="40"
                    cy="40"
                    r="38"
                    fill="none"
                    stroke="white"
                    strokeWidth="4"
                  />
                  {camera.recording ? (
                    <circle
                      data-testid="story-capture-progress"
                      cx="40"
                      cy="40"
                      r="38"
                      fill="none"
                      stroke="var(--brand-primary)"
                      strokeWidth="4"
                      strokeDasharray={RING}
                      strokeDashoffset={RING * (1 - progress)}
                    />
                  ) : null}
                </svg>
                <span
                  className={`rounded-full transition-all ${
                    camera.recording
                      ? 'h-8 w-8 rounded-lg bg-brand-secondary'
                      : mode === 'FRAME'
                        ? 'h-16 w-16 bg-brand-secondary'
                        : 'h-16 w-16 bg-white'
                  }`}
                />
              </button>
            ) : (
              <span className="h-20 w-20" />
            )}

            {hasClips ? (
              // On to the editor with the clips, once they make a Frame.
              <button
                type="button"
                onClick={() => onCaptureClips?.(clips)}
                disabled={camera.recording || !enoughClips}
                aria-label={t('story.capture.clips_next')}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black disabled:opacity-40"
              >
                <Check size={22} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={camera.switchCamera}
                disabled={camera.state !== 'on' || camera.recording}
                aria-label={t('story.capture.switch_camera')}
                className={`${ROUND} disabled:opacity-40`}
              >
                <SwitchCamera size={24} aria-hidden />
              </button>
            )}
          </div>
        ) : null}

        {hasClips && !enoughClips ? (
          <p className="mt-3 text-center text-xs text-white/70">
            {t('story.capture.clips_min', { min: FRAME_MIN_DURATION_SEC })}
          </p>
        ) : null}

        {live && isLive ? (
          <p className="mt-3 text-center text-xs text-white/70">
            {t('story.capture.live_hint')}
          </p>
        ) : null}

        <fieldset
          aria-label={t('story.capture.modes')}
          className={`m-0 flex min-w-0 justify-center gap-1 border-0 p-0 ${live ? 'mt-3' : ''}`}
        >
          {(onModeChange ? CAPTURE_MODES : (['STORY'] as const)).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === mode}
              // Changing format would lose the clips recorded.
              disabled={camera.recording || hasClips}
              onClick={() => m !== mode && onModeChange?.(m)}
              className={`min-h-11 whitespace-nowrap rounded-full px-3 text-sm ${
                m === mode
                  ? 'font-bold text-white'
                  : 'font-semibold text-white/60 hover:text-white'
              }`}
            >
              {t(MODE_LABEL[m])}
            </button>
          ))}
        </fieldset>
      </div>
    </div>
  );
}
