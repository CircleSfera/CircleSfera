import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';

export default function StudioPlaybackControls() {
  const { t } = useTranslation();
  const {
    project,
    playhead,
    setPlayhead,
    isPlaying,
    togglePlayback,
    setPlaying,
  } = useStudioStore();
  const fps = project?.fps || 30;
  const frameDuration = 1 / fps;

  const formatTimecode = (timeInSeconds: number) => {
    const mins = Math.floor(timeInSeconds / 60);
    const secs = Math.floor(timeInSeconds % 60);
    const frames = Math.floor((timeInSeconds % 1) * fps);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;
  };

  const stepFrames = (frames: number) => {
    setPlaying(false);
    const max = project?.duration ?? Number.POSITIVE_INFINITY;
    setPlayhead(Math.max(0, Math.min(max, playhead + frames * frameDuration)));
  };

  const toggleFullscreen = () => {
    const preview = document.querySelector('[data-studio-preview]');
    if (!preview) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (preview instanceof HTMLElement && preview.requestFullscreen) {
      void preview.requestFullscreen();
    }
  };

  return (
    <div className="min-h-14 bg-surface-base/80 border-t border-white/5 shrink-0 flex items-center justify-between px-2 sm:px-6 z-20">
      <div className="w-16 sm:w-32 shrink-0">
        <span className="font-mono text-xs sm:text-sm text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded">
          {formatTimecode(playhead)}
        </span>
        <span className="font-mono text-xs text-white/30 ml-2 hidden sm:inline">
          / {formatTimecode(project?.duration || 0)}
        </span>
      </div>

      <div className="flex items-center gap-1 sm:gap-3">
        <button
          type="button"
          onClick={() => setPlayhead(0)}
          className="min-h-11 min-w-11 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          aria-label={t('studio.playback.start')}
        >
          <SkipBack size={18} />
        </button>

        <button
          type="button"
          onClick={() => stepFrames(-1)}
          className="min-h-11 min-w-11 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          aria-label={t('studio.playback.frame_back')}
        >
          <ChevronLeft size={18} />
        </button>

        <button
          type="button"
          onClick={togglePlayback}
          className="w-12 h-12 flex items-center justify-center bg-white text-black hover:bg-white/90 rounded-full transition-all shadow-lg"
          aria-label={
            isPlaying ? t('studio.playback.pause') : t('studio.playback.play')
          }
        >
          {isPlaying ? (
            <Pause size={22} className="fill-black" />
          ) : (
            <Play size={22} className="fill-black ml-1" />
          )}
        </button>

        <button
          type="button"
          onClick={() => stepFrames(1)}
          className="min-h-11 min-w-11 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          aria-label={t('studio.playback.frame_forward')}
        >
          <ChevronRight size={18} />
        </button>

        <button
          type="button"
          onClick={() => project && setPlayhead(project.duration)}
          className="min-h-11 min-w-11 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          aria-label={t('studio.playback.end')}
        >
          <SkipForward size={18} />
        </button>
      </div>

      <div className="w-20 sm:w-32 flex justify-end gap-2 shrink-0">
        <button
          type="button"
          onClick={toggleFullscreen}
          className="min-h-11 min-w-11 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          aria-label={t('studio.playback.fullscreen')}
        >
          <Maximize size={16} />
        </button>
      </div>
    </div>
  );
}
