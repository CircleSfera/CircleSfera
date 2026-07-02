import { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../../stores/studioStore';
import Playhead from './Playhead';
import TrackItem from './Track';

export default function Timeline() {
  const { project, zoom, setPlayhead, isPlaying } = useStudioStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (containerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: Needs to run when duration or zoom changes
  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [project?.duration, zoom]);

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
    checkScroll();
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

  // Generate ruler markers
  const rulerMarkers = [];
  const duration = Math.max(project.duration, 10); // Minimum 10s ruler
  for (let i = 0; i <= duration; i += 1) {
    rulerMarkers.push(
      <div
        key={`sec-${i}`}
        className="absolute bottom-0 flex flex-col items-center"
        style={{ left: `${i * zoom}px`, transform: 'translateX(-50%)' }}
      >
        <span className="text-[10px] text-white/50 mb-1 font-mono">
          00:{i.toString().padStart(2, '0')}
        </span>
        <div className="w-px h-2 bg-white/20" />
      </div>,
    );
    // Add half-second marker
    if (zoom >= 40 && i < duration) {
      rulerMarkers.push(
        <div
          key={`half-${i}`}
          className="absolute bottom-0 w-px h-1 bg-white/10"
          style={{ left: `${(i + 0.5) * zoom}px` }}
        />,
      );
    }
  }

  return (
    <div className="relative w-full h-full bg-[#0e0e12] overflow-hidden flex flex-col border-t border-white/10 group">
      {/* Scroll Indicators */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-8 bg-linear-to-r from-[#0e0e12] to-transparent z-20 pointer-events-none transition-opacity duration-300 ${canScrollLeft ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        className={`absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-[#0e0e12] to-transparent z-20 pointer-events-none transition-opacity duration-300 ${canScrollRight ? 'opacity-100' : 'opacity-0'}`}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative no-scrollbar"
        onScroll={handleScroll}
      >
        <button
          type="button"
          className="relative min-h-full block text-left p-0 cursor-text outline-none"
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
          {/* Time markers (Ruler) */}
          <div className="sticky top-0 z-20 h-6 border-b border-white/10 bg-[#0e0e12]/90 backdrop-blur w-full mb-4">
            <div className="relative h-full pointer-events-none">
              {rulerMarkers}
            </div>
          </div>

          <div className="pb-8 flex flex-col gap-3 min-h-[calc(100%-1.5rem)]">
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
