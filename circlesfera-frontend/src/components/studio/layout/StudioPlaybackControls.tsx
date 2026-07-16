import { Maximize, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useStudioStore } from '../../../stores/studioStore';

export default function StudioPlaybackControls() {
  const { project, playhead, setPlayhead, isPlaying, togglePlayback } =
    useStudioStore();

  const formatTimecode = (timeInSeconds: number) => {
    const mins = Math.floor(timeInSeconds / 60);
    const secs = Math.floor(timeInSeconds % 60);
    const frames = Math.floor((timeInSeconds % 1) * 30);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;
  };

  const skipFrames = (frames: number) => {
    const timeToSkip = frames / 30;
    setPlayhead(Math.max(0, playhead + timeToSkip));
  };

  return (
    <div className="h-16 bg-[#0a0a0c]/80 backdrop-blur-md border-t border-white/5 shrink-0 flex items-center justify-between px-3 sm:px-6 z-20">
      {/* Left: Timecode */}
      <div className="w-24 sm:w-32">
        <span className="font-mono text-xs sm:text-sm text-brand-primary drop-shadow-[0_0_8px_rgba(131,58,180,0.5)] bg-brand-primary/10 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded">
          {formatTimecode(playhead)}
        </span>
        <span className="font-mono text-xs text-white/30 ml-2 hidden sm:inline">
          / {formatTimecode(project?.duration || 0)}
        </span>
      </div>

      {/* Center: Playback Buttons */}
      <div className="flex items-center gap-3 sm:gap-6">
        <button
          type="button"
          onClick={() => setPlayhead(0)}
          className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title="Ir al inicio"
        >
          <SkipBack size={18} />
        </button>

        <button
          type="button"
          onClick={() => skipFrames(-1)}
          className="hidden sm:block p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title="Frame anterior"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="11 19 2 12 11 5 11 19"></polygon>
            <polygon points="22 19 13 12 22 5 22 19"></polygon>
          </svg>
        </button>

        <button
          type="button"
          onClick={togglePlayback}
          className="w-12 h-12 flex items-center justify-center bg-white text-black hover:bg-zinc-200 hover:scale-105 rounded-full transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]"
        >
          {isPlaying ? (
            <Pause size={22} className="fill-black" />
          ) : (
            <Play size={22} className="fill-black ml-1" />
          )}
        </button>

        <button
          type="button"
          onClick={() => skipFrames(1)}
          className="hidden sm:block p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title="Siguiente frame"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="13 19 22 12 13 5 13 19"></polygon>
            <polygon points="2 19 11 12 2 5 2 19"></polygon>
          </svg>
        </button>

        <button
          type="button"
          onClick={() => project && setPlayhead(project.duration)}
          className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title="Ir al final"
        >
          <SkipForward size={18} />
        </button>
      </div>

      {/* Right: Fullscreen/Settings */}
      <div className="w-24 sm:w-32 flex justify-end gap-2">
        <button
          type="button"
          className="p-1.5 text-white/30 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <Maximize size={16} />
        </button>
      </div>
    </div>
  );
}
