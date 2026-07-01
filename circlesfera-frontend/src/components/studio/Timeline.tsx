import { useEffect, useRef } from 'react';
import { useStudioStore } from '../../stores/studioStore';
import Playhead from './Playhead';
import TrackItem from './Track';

export default function Timeline() {
  const { project, zoom, setPlayhead, isPlaying } = useStudioStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll timeline when playing
  useEffect(() => {
    if (!isPlaying || !containerRef.current) return;

    let animationFrameId: number;
    const scrollLoop = () => {
      if (containerRef.current) {
        const { playhead, zoom } = useStudioStore.getState();
        const playheadX = playhead * zoom;
        const containerWidth = containerRef.current.clientWidth;

        // Keep playhead roughly in the middle of the screen when playing
        const targetScroll = playheadX - containerWidth / 2;
        containerRef.current.scrollLeft = targetScroll;
      }
      animationFrameId = requestAnimationFrame(scrollLoop);
    };

    animationFrameId = requestAnimationFrame(scrollLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying]);

  const handleScroll = () => {
    if (isPlaying) return; // Don't allow manual scrub via scroll while playing
    if (!containerRef.current) return;

    // In a real editor like CapCut, scrolling horizontally scrubs the playhead.
    // For now, we just let them scroll. We can implement scroll-scrubbing later if desired.
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + containerRef.current.scrollLeft;
    // Account for the padding at the start (e.g. 50vw so playhead can start at center)
    const offsetLeft = containerRef.current.clientWidth / 2;

    let newTime = (clickX - offsetLeft) / zoom;
    if (newTime < 0) newTime = 0;

    setPlayhead(newTime);
  };

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center text-white/50">
        Comienza agregando contenido
      </div>
    );
  }

  // Add padding equal to half the container width so the start/end can be centered under the playhead
  const paddingStyle = { paddingLeft: '50vw', paddingRight: '50vw' };

  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden flex flex-col border-t border-white/10">
      {/* Time markers (Ruler) */}
      <div className="h-6 border-b border-white/10 shrink-0 sticky top-0 z-20 bg-zinc-950/80 backdrop-blur" />

      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative no-scrollbar"
        onScroll={handleScroll}
      >
        <button
          type="button"
          className="relative min-h-full block text-left p-0 cursor-text"
          style={{
            width: `${Math.max(project.duration * zoom, 0)}px`,
            ...paddingStyle,
          }}
          onClick={handleTimelineClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              // trigger same logic
            }
          }}
        >
          <div className="py-4 flex flex-col gap-2">
            {project.tracks.map((track) => (
              <TrackItem key={track.id} track={track} />
            ))}
          </div>

          <Playhead />
        </button>
      </div>
    </div>
  );
}
