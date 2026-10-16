import { Images, Sparkles, SwitchCamera, X, Zap, ZapOff } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BrandAmbientBackground from '../../common/BrandAmbientBackground';
import { CREATE_FULL_SCREEN } from '../../create-post/createStyles';
import { STORY_RECORD_MAX_SEC, useStoryCamera } from './useStoryCamera';

/** How long the shutter is held before it records instead of taking a photo. */
const HOLD_MS = 300;

const ROUND =
  'flex h-11 w-11 items-center justify-center rounded-full text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] hover:bg-white/10';

export interface StoryCaptureProps {
  /** A photo taken or a video recorded, for the editor. */
  onCapture: (file: File) => void;
  /** The gallery of the device, or the file picker. */
  onOpenGallery: () => void;
  /** A text story on a background. */
  onCreate: () => void;
  onClose: () => void;
}

/**
 * Where a story starts: the camera fills the screen, a tap on the shutter
 * takes a photo and holding it records a video. The gallery and a text story
 * are a tap away, and stay when there is no camera to use.
 */
export default function StoryCapture({
  onCapture,
  onOpenGallery,
  onCreate,
  onClose,
}: StoryCaptureProps) {
  const { t } = useTranslation();
  const camera = useStoryCamera();
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // How much of the longest video has been recorded, for the ring.
  useEffect(() => {
    if (!camera.recording) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 100);
    return () => clearInterval(timer);
  }, [camera.recording]);

  const photo = async () => {
    const file = await camera.takePhoto();
    if (file) onCapture(file);
  };

  const onShutterDown = (e: React.PointerEvent) => {
    if (camera.state !== 'on') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    holdRef.current = setTimeout(() => {
      holdRef.current = null;
      void camera.startRecording((file) => {
        if (file) onCapture(file);
      });
    }, HOLD_MS);
  };

  const onShutterUp = () => {
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
      void photo();
      return;
    }
    camera.stopRecording();
  };

  const live = camera.state === 'on' || camera.state === 'starting';
  const progress = Math.min(1, elapsed / (STORY_RECORD_MAX_SEC * 1000));
  const RING = 2 * Math.PI * 38;

  return (
    <div
      className={`${CREATE_FULL_SCREEN} flex flex-col bg-black text-white md:bg-transparent`}
      data-testid="story-capture"
    >
      {/* As behind the editor: the brand's wash around the camera on a
          computer; a phone keeps the camera on black. */}
      <BrandAmbientBackground placement="editor" />
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
              <div className="flex w-full max-w-sm flex-col gap-3">
                <button
                  type="button"
                  onClick={onOpenGallery}
                  className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold hover:bg-white/15"
                >
                  <Images size={18} aria-hidden />
                  {t('story.capture.gallery')}
                </button>
                <button
                  type="button"
                  onClick={onCreate}
                  className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold hover:bg-white/15"
                >
                  <Sparkles size={18} aria-hidden />
                  {t('createPost.upload.create_text_story')}
                </button>
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

      {/* Without a camera, the two buttons above are all there is. */}
      {live ? (
        <div className="shrink-0 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <div className="mx-auto flex max-w-sm items-center justify-between">
            <button
              type="button"
              onClick={onOpenGallery}
              aria-label={t('story.capture.gallery')}
              className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white/80 bg-white/10 hover:bg-white/20"
            >
              <Images size={20} aria-hidden />
            </button>

            {camera.state === 'on' ? (
              <button
                type="button"
                aria-label={
                  camera.recording
                    ? t('story.capture.recording')
                    : t('story.capture.shutter')
                }
                onPointerDown={onShutterDown}
                onPointerUp={onShutterUp}
                onPointerCancel={onShutterUp}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void photo();
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
                  className={`rounded-full bg-white transition-all ${
                    camera.recording
                      ? 'h-8 w-8 rounded-lg bg-brand-secondary'
                      : 'h-16 w-16'
                  }`}
                />
              </button>
            ) : (
              <span className="h-20 w-20" />
            )}

            <button
              type="button"
              onClick={camera.switchCamera}
              disabled={camera.state !== 'on' || camera.recording}
              aria-label={t('story.capture.switch_camera')}
              className={`${ROUND} disabled:opacity-40`}
            >
              <SwitchCamera size={24} aria-hidden />
            </button>
          </div>

          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              aria-pressed
              className="min-h-11 rounded-full px-4 text-sm font-bold text-white"
            >
              {t('story.capture.mode_story')}
            </button>
            <button
              type="button"
              onClick={onCreate}
              aria-label={t('createPost.upload.create_text_story')}
              className="min-h-11 rounded-full px-4 text-sm font-semibold text-white/60 hover:text-white"
            >
              {t('story.capture.mode_create')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
