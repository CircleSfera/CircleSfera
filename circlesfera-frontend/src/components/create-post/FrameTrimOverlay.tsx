import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FrameClipWindow } from '../../utils/frameClip';
import type { VideoData } from '../PhotoEditor';
import { Button } from '../ui';
import FrameClipControls from './FrameClipControls';

interface FrameTrimOverlayProps {
  file: File;
  url: string;
  sourceDurationSec: number;
  initialWindow: FrameClipWindow;
  muted?: boolean;
  onConfirm: (videoData: VideoData) => void;
  onCancel: () => void;
}

export default function FrameTrimOverlay({
  file: _file,
  url,
  sourceDurationSec,
  initialWindow,
  muted = false,
  onConfirm,
  onCancel,
}: FrameTrimOverlayProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [windowState, setWindowState] =
    useState<FrameClipWindow>(initialWindow);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = windowState.startTime;
    try {
      const playResult = v.play();
      if (playResult && typeof playResult.catch === 'function') {
        void playResult.catch(() => undefined);
      }
    } catch {
      // jsdom / autoplay blocked
    }
  }, [windowState.startTime]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTimeUpdate = () => {
      if (v.currentTime >= windowState.endTime - 0.05) {
        v.currentTime = windowState.startTime;
      }
    };
    v.addEventListener('timeupdate', onTimeUpdate);
    return () => v.removeEventListener('timeupdate', onTimeUpdate);
  }, [windowState.startTime, windowState.endTime]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (
      v.currentTime < windowState.startTime ||
      v.currentTime >= windowState.endTime
    ) {
      v.currentTime = windowState.startTime;
    }
  }, [windowState.endTime, windowState.startTime]);

  const handleConfirm = () => {
    onConfirm({
      startTime: windowState.startTime,
      endTime: windowState.endTime,
      muted,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      <header className="flex justify-between items-center gap-2 shrink-0 z-10 px-3 pb-1.5 pt-[max(0.5rem,calc(env(safe-area-inset-top,0px)+0.25rem))] bg-linear-to-b from-black via-black/90 to-transparent min-h-11">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCancel}
          className="min-w-9 min-h-9 rounded-full bg-white/10 text-white hover:bg-white/16"
          aria-label={t('createPost.edit.cancel')}
        >
          <X size={16} strokeWidth={2} />
        </Button>
        <h1 className="text-sm font-semibold tracking-tight text-white truncate flex-1 text-center px-1">
          {t('createPost.frameTrim.title')}
        </h1>
        <Button
          type="button"
          onClick={handleConfirm}
          className="min-h-9 px-3 rounded-full bg-linear-to-r from-brand-primary to-brand-blue text-white text-xs font-bold flex items-center gap-1 shadow-md shadow-brand-primary/25"
          aria-label={t('createPost.edit.done')}
        >
          {t('createPost.edit.done')} <Check size={14} strokeWidth={2.5} />
        </Button>
      </header>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-zinc-950 min-h-0">
        <video
          ref={videoRef}
          src={url}
          className="max-h-full max-w-full object-contain"
          playsInline
          muted={muted}
          autoPlay
        />
      </div>

      <div className="shrink-0 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-surface-elevated border-t border-white/8">
        <FrameClipControls
          sourceDurationSec={sourceDurationSec}
          window={windowState}
          onChange={setWindowState}
          showPresets
          compact
        />
      </div>
    </div>
  );
}
