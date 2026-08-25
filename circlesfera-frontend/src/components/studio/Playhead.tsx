import { motion } from 'framer-motion';
import { useRef } from 'react';
import { useStudioStore } from '../../stores/studioStore';

const TIMELINE_OFFSET_PX = 32;

export default function Playhead() {
  const { playhead, zoom, setPlayhead, setPlaying, project } = useStudioStore();
  const draggingRef = useRef(false);

  const xPos = playhead * zoom;
  const fps = project?.fps || 30;

  const formatTime = (timeInSeconds: number) => {
    const mins = Math.floor(timeInSeconds / 60);
    const secs = Math.floor(timeInSeconds % 60);
    const frames = Math.floor((timeInSeconds % 1) * fps);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;
  };

  const scrubToClientX = (clientX: number, timelineEl: HTMLElement | null) => {
    if (!timelineEl) return;
    const rect = timelineEl.getBoundingClientRect();
    const scrollLeft = timelineEl.scrollLeft || 0;
    const x = clientX - rect.left + scrollLeft - TIMELINE_OFFSET_PX;
    const max = project?.duration ?? Number.POSITIVE_INFINITY;
    setPlayhead(Math.max(0, Math.min(max, x / zoom)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setPlaying(false);
    const timelineEl = e.currentTarget.closest(
      '[data-studio-timeline]',
    ) as HTMLElement | null;
    scrubToClientX(e.clientX, timelineEl);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const timelineEl = e.currentTarget.closest(
      '[data-studio-timeline]',
    ) as HTMLElement | null;
    scrubToClientX(e.clientX, timelineEl);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <motion.div
      className="absolute top-0 bottom-0 z-30"
      style={{ left: `calc(${TIMELINE_OFFSET_PX}px + ${xPos}px)` }}
    >
      <div className="w-px h-full bg-brand-primary relative shadow-[0_0_8px_rgba(140,82,255,0.8),0_0_2px_rgba(255,255,255,0.8)] pointer-events-none">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Playhead"
          aria-valuemin={0}
          aria-valuemax={project?.duration ?? 0}
          aria-valuenow={playhead}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 1 : 1 / fps;
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              setPlayhead(Math.max(0, playhead - step));
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              setPlayhead(
                Math.min(project?.duration ?? playhead + step, playhead + step),
              );
            }
          }}
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-auto cursor-grab active:cursor-grabbing group touch-none min-w-11 min-h-11 flex items-start justify-center"
        >
          <svg
            width="14"
            height="18"
            viewBox="0 0 14 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] mt-1"
            role="img"
            aria-label="Playhead"
          >
            <path
              d="M0 2C0 0.895431 0.895431 0 2 0H12C13.1046 0 14 0.895431 14 2V14.5L7 19.5L0 14.5V2Z"
              className="fill-brand-primary group-hover:fill-purple-400 transition-colors"
            />
          </svg>
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur text-white text-[10px] font-mono px-1.5 py-0.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-white/10 pointer-events-none">
            {formatTime(playhead)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
