import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FrameClipWindow } from '../../utils/frameClip';
import BrandAmbientBackground from '../common/BrandAmbientBackground';
import type { VideoData } from '../PhotoEditor';
import { CREATE_FULL_SCREEN } from './createStyles';
import EditorHeader, { EditorHeaderAction } from './EditorHeader';
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
    <div className={`${CREATE_FULL_SCREEN} text-white flex flex-col`}>
      <BrandAmbientBackground placement="editor" />
      <EditorHeader
        surface="overlay"
        leading="close"
        leadingLabel={t('createPost.edit.cancel')}
        onLeading={onCancel}
        title={t('createPost.frameTrim.title')}
        trailing={
          <EditorHeaderAction
            label={t('createPost.edit.done')}
            onClick={handleConfirm}
            withCheck
          />
        }
      />

      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-zinc-950 md:bg-transparent min-h-0">
        <video
          ref={videoRef}
          src={url}
          className="max-h-full max-w-full object-contain"
          playsInline
          muted={muted}
          autoPlay
        />
      </div>

      <div className="shrink-0 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-surface-elevated border-t border-white/8">
        <div className="mx-auto w-full md:max-w-xl">
          <FrameClipControls
            sourceDurationSec={sourceDurationSec}
            window={windowState}
            onChange={setWindowState}
            showPresets
            compact
          />
        </div>
      </div>
    </div>
  );
}
