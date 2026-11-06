import { Pause, Play, Redo2, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';

/** Time as minutes, seconds and tenths: 0:04.2. */
export function formatTimecode(seconds: number): string {
  const tenths = Math.max(0, Math.round(seconds * 10));
  const s = Math.floor(tenths / 10);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}.${tenths % 10}`;
}

/** The time, play and pause, undo and redo: between the video and the timeline. */
export default function EditorTransport() {
  const { t } = useTranslation();
  const playhead = useStudioStore((s) => s.playhead);
  const duration = useStudioStore((s) => s.project?.duration ?? 0);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const togglePlayback = useStudioStore((s) => s.togglePlayback);
  const setPlayhead = useStudioStore((s) => s.setPlayhead);
  const undo = useStudioStore((s) => s.undo);
  const redo = useStudioStore((s) => s.redo);
  const canUndo = useStudioStore((s) => s.canUndo);
  const canRedo = useStudioStore((s) => s.canRedo);

  return (
    <div className="shrink-0 grid grid-cols-3 items-center px-3 h-14">
      <p className="text-xs font-mono text-white/70 tabular-nums">
        <span className="text-white">{formatTimecode(playhead)}</span>
        <span className="text-white/40"> / {formatTimecode(duration)}</span>
      </p>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => {
            // Playing from the end starts again from the beginning.
            if (!isPlaying && playhead >= duration - 0.05) setPlayhead(0);
            togglePlayback();
          }}
          aria-label={isPlaying ? t('studio.pause') : t('studio.play')}
          className="h-12 w-12 flex items-center justify-center rounded-full bg-white text-black"
        >
          {isPlaying ? (
            <Pause size={22} aria-hidden />
          ) : (
            <Play size={22} className="ml-0.5" aria-hidden />
          )}
        </button>
      </div>
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          aria-label={t('studio.undo')}
          className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-white hover:bg-white/10 disabled:opacity-30"
        >
          <Undo2 size={18} aria-hidden />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          aria-label={t('studio.redo')}
          className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-white hover:bg-white/10 disabled:opacity-30"
        >
          <Redo2 size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
