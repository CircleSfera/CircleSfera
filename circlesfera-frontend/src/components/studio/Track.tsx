import {
  Eye,
  EyeOff,
  Image,
  Lock,
  Music,
  Trash2,
  Type,
  Unlock,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../../stores/studioStore';
import type { Clip, Track } from '../../types/studio';

interface TrackItemProps {
  track: Track;
}

export default function TrackItem({ track }: TrackItemProps) {
  const {
    zoom,
    toggleTrackMute,
    toggleTrackHidden,
    toggleTrackLock,
    removeTrack,
  } = useStudioStore();

  const getTrackIcon = () => {
    switch (track.type) {
      case 'video':
        return <Video size={14} className="text-blue-400" />;
      case 'audio':
        return <Music size={14} className="text-purple-400" />;
      case 'text':
        return <Type size={14} className="text-amber-400" />;
      default:
        return <Image size={14} className="text-teal-400" />;
    }
  };

  return (
    <div
      className={`relative h-16 w-full bg-white/2 rounded-xl border flex items-center group transition-colors ${
        track.locked
          ? 'border-red-500/20 bg-red-950/5'
          : 'border-white/5 hover:border-white/10'
      }`}
    >
      {/* Sticky Track Header Controls */}
      <div className="sticky left-4 z-20 flex items-center gap-1.5 bg-black/80 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10 shadow-lg">
        <div className="flex items-center gap-1.5 mr-1">
          {getTrackIcon()}
          <span className="text-xs font-bold text-white/90 truncate max-w-20 sm:max-w-28">
            {track.name}
          </span>
        </div>

        {/* Track Mute Toggle */}
        <button
          type="button"
          onClick={() => toggleTrackMute(track.id)}
          className={`p-1 rounded hover:bg-white/10 transition-colors ${
            track.muted ? 'text-red-400' : 'text-white/40 hover:text-white'
          }`}
          title={track.muted ? 'Desactivar Silencio' : 'Silenciar pista'}
        >
          {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>

        {/* Track Hide Toggle */}
        <button
          type="button"
          onClick={() => toggleTrackHidden(track.id)}
          className={`p-1 rounded hover:bg-white/10 transition-colors ${
            track.hidden ? 'text-amber-400' : 'text-white/40 hover:text-white'
          }`}
          title={track.hidden ? 'Mostrar pista' : 'Ocultar pista'}
        >
          {track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>

        {/* Track Lock Toggle */}
        <button
          type="button"
          onClick={() => toggleTrackLock(track.id)}
          className={`p-1 rounded hover:bg-white/10 transition-colors ${
            track.locked ? 'text-red-400' : 'text-white/40 hover:text-white'
          }`}
          title={track.locked ? 'Desbloquear pista' : 'Bloquear pista'}
        >
          {track.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>

        {/* Track Remove (only if more than 1 track) */}
        <button
          type="button"
          onClick={() => removeTrack(track.id)}
          className="p-1 text-white/30 hover:text-red-400 hover:bg-white/10 rounded transition-colors opacity-0 group-hover:opacity-100"
          title="Eliminar pista"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div
        className={`absolute inset-0 ${track.locked ? 'pointer-events-none opacity-60' : ''}`}
      >
        {track.clips.map((clip) => (
          <ClipItem key={clip.id} clip={clip} zoom={zoom} />
        ))}
      </div>
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

  let bgClass = 'bg-zinc-800';
  let icon = null;

  if (clip.type === 'video') {
    bgClass = 'bg-linear-to-r from-blue-600 to-indigo-600';
    icon = <Video size={12} className="shrink-0 text-white" />;
  } else if (clip.type === 'image') {
    bgClass = 'bg-linear-to-r from-teal-500 to-cyan-600';
    icon = <Image size={12} className="shrink-0 text-white" />;
  } else if (clip.type === 'audio') {
    bgClass = 'bg-linear-to-r from-purple-600 to-pink-600';
    icon = <Music size={12} className="shrink-0 text-white" />;
  } else if (clip.type === 'text') {
    bgClass = 'bg-linear-to-r from-amber-500 to-orange-600';
    icon = <Type size={12} className="shrink-0 text-white" />;
  }

  return (
    <button
      type="button"
      onPointerDown={handleDragStart}
      className={`absolute top-1 bottom-1 rounded-xl overflow-hidden flex items-center cursor-grab active:cursor-grabbing transition-all border shadow-md ${
        isSelected
          ? 'border-white z-10 ring-2 ring-brand-primary ring-offset-2 ring-offset-[#0e0e12] scale-[1.01] brightness-110 shadow-lg shadow-brand-primary/20'
          : 'border-white/10 hover:brightness-110'
      } ${bgClass}`}
      style={{
        width: `${width}px`,
        left: `${left}px`,
        touchAction: 'none',
      }}
    >
      <div className="flex items-center gap-1.5 px-3 w-full h-full text-white pointer-events-none">
        {icon}
        <span className="text-[11px] font-bold truncate select-none drop-shadow-md">
          {clip.type === 'text'
            ? (clip as any).content
            : clip.type.charAt(0).toUpperCase() + clip.type.slice(1)}
        </span>
      </div>

      {/* Left Trim Handle */}
      {isSelected && (
        <div
          onPointerDown={(e) => handleTrimStart(e, 'left')}
          className="absolute left-0 top-0 bottom-0 w-3 bg-black/40 hover:bg-black/60 backdrop-blur-sm cursor-ew-resize touch-none flex items-center justify-center border-r border-white/40 transition-colors"
        >
          <div className="w-0.5 h-4 bg-white rounded-full shadow-sm" />
        </div>
      )}

      {/* Right Trim Handle */}
      {isSelected && (
        <div
          onPointerDown={(e) => handleTrimStart(e, 'right')}
          className="absolute right-0 top-0 bottom-0 w-3 bg-black/40 hover:bg-black/60 backdrop-blur-sm cursor-ew-resize touch-none flex items-center justify-center border-l border-white/40 transition-colors"
        >
          <div className="w-0.5 h-4 bg-white rounded-full shadow-sm" />
        </div>
      )}
    </button>
  );
}
