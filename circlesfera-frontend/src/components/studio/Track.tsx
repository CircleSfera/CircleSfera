import { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../../stores/studioStore';
import type { Clip, Track } from '../../types/studio';

interface TrackItemProps {
  track: Track;
}

export default function TrackItem({ track }: TrackItemProps) {
  const { zoom } = useStudioStore();

  return (
    <div className="relative h-16 w-full bg-white/5 rounded-md border border-white/5">
      {track.clips.map((clip) => (
        <ClipItem key={clip.id} clip={clip} zoom={zoom} />
      ))}
    </div>
  );
}

interface ClipItemProps {
  clip: Clip;
  zoom: number;
}

function ClipItem({ clip, zoom }: ClipItemProps) {
  const { selectedClipId, selectClip, updateClip } = useStudioStore();
  const isSelected = selectedClipId === clip.id;

  const [isTrimming, setIsTrimming] = useState<'left' | 'right' | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const startXRef = useRef(0);
  const initialClipRef = useRef(clip);

  const handleTrimStart = (e: React.PointerEvent, edge: 'left' | 'right') => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsTrimming(edge);
    startXRef.current = e.clientX;
    initialClipRef.current = clip;
    selectClip(clip.id);
  };

  const handleDragStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    startXRef.current = e.clientX;
    initialClipRef.current = clip;
    selectClip(clip.id);
  };

  useEffect(() => {
    if (!isTrimming && !isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const deltaX = e.clientX - startXRef.current;
      const deltaSeconds = deltaX / zoom;
      const orig = initialClipRef.current;

      if (isDragging) {
        const newStartAt = Math.max(0, orig.startAt + deltaSeconds);
        updateClip(clip.id, { startAt: newStartAt });
      } else if (isTrimming === 'left') {
        let newDuration = orig.duration - deltaSeconds;
        let newStartAt = orig.startAt + deltaSeconds;
        let newMediaStart =
          orig.type !== 'text' ? (orig as any).mediaStart + deltaSeconds : 0;

        if (newDuration < 0.5) {
          const over = 0.5 - newDuration;
          newDuration = 0.5;
          newStartAt -= over;
          newMediaStart -= over;
        }
        if (orig.type !== 'text' && newMediaStart < 0) {
          const over = 0 - newMediaStart;
          newMediaStart = 0;
          newStartAt += over;
          newDuration += over;
        }

        const updates: any = {
          startAt: Math.max(0, newStartAt),
          duration: newDuration,
        };
        if (orig.type !== 'text') {
          updates.mediaStart = newMediaStart;
        }
        updateClip(clip.id, updates);
      } else if (isTrimming === 'right') {
        let newDuration = orig.duration + deltaSeconds;
        if (newDuration < 0.5) newDuration = 0.5;
        // In a full app, limit newDuration so it doesn't exceed the original media duration.
        updateClip(clip.id, { duration: newDuration });
      }
    };

    const handlePointerUp = () => {
      setIsTrimming(null);
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isTrimming, isDragging, zoom, clip.id, updateClip]);

  const width = clip.duration * zoom;
  const left = clip.startAt * zoom;

  let bgClass = 'bg-zinc-700';
  if (clip.type === 'video') bgClass = 'bg-blue-600/80';
  if (clip.type === 'image') bgClass = 'bg-teal-600/80';
  if (clip.type === 'audio') bgClass = 'bg-purple-600/80';
  if (clip.type === 'text') bgClass = 'bg-amber-600/80';

  return (
    <button
      type="button"
      onPointerDown={handleDragStart}
      className={`absolute top-0 bottom-0 rounded-md overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing transition-colors border-2 ${
        isSelected ? 'border-white z-10' : 'border-transparent'
      } ${bgClass}`}
      style={{
        width: `${width}px`,
        left: `${left}px`,
        touchAction: 'none', // Prevent scrolling while dragging
      }}
    >
      <span className="text-[10px] font-bold text-white truncate px-4 select-none pointer-events-none">
        {clip.type === 'text' ? (clip as any).content : clip.type}
      </span>

      {/* Left Trim Handle */}
      {isSelected && (
        <div
          onPointerDown={(e) => handleTrimStart(e, 'left')}
          className="absolute left-0 top-0 bottom-0 w-4 bg-white/30 cursor-ew-resize hover:bg-white/50 touch-none flex items-center justify-center"
        >
          <div className="w-0.5 h-4 bg-white rounded-full" />
        </div>
      )}

      {/* Right Trim Handle */}
      {isSelected && (
        <div
          onPointerDown={(e) => handleTrimStart(e, 'right')}
          className="absolute right-0 top-0 bottom-0 w-4 bg-white/30 cursor-ew-resize hover:bg-white/50 touch-none flex items-center justify-center"
        >
          <div className="w-0.5 h-4 bg-white rounded-full" />
        </div>
      )}
    </button>
  );
}
