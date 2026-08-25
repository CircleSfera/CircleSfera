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
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../stores/studioStore';
import type { Clip, MediaClip, Track } from '../../types/studio';

interface TrackItemProps {
  track: Track;
  compact?: boolean;
}

export default function TrackItem({ track, compact = true }: TrackItemProps) {
  const { t } = useTranslation();
  const {
    project,
    zoom,
    toggleTrackMute,
    toggleTrackHidden,
    toggleTrackLock,
    removeTrack,
  } = useStudioStore();

  const videoTrackCount =
    project?.tracks.filter((tr) => tr.type === 'video').length ?? 0;

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (track.type === 'video' && videoTrackCount <= 1) {
      toast.error(t('studio.tracks.keep_one_video'));
      return;
    }
    if (track.clips.length > 0) {
      if (!window.confirm(t('studio.tracks.remove_confirm'))) return;
    }
    removeTrack(track.id);
    toast.success(t('studio.tracks.removed'));
  };

  const getTrackIcon = () => {
    switch (track.type) {
      case 'video':
        return <Video size={14} className="text-brand-blue" />;
      case 'audio':
        return <Music size={14} className="text-brand-primary" />;
      case 'text':
        return <Type size={14} className="text-brand-accent" />;
      default:
        return <Image size={14} className="text-brand-secondary" />;
    }
  };

  return (
    <div
      className={`relative h-14 w-full bg-white/2 rounded-xl border flex items-center group transition-colors ${
        track.locked
          ? 'border-brand-secondary/20 bg-brand-secondary/5'
          : 'border-white/5 hover:border-white/10'
      }`}
    >
      <div
        className={`sticky left-1 z-20 flex items-center gap-0.5 bg-black/85 backdrop-blur-md rounded-lg border border-white/10 shadow-lg ${
          compact ? 'px-1 py-0.5' : 'px-2 py-1'
        }`}
      >
        {getTrackIcon()}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleTrackMute(track.id);
          }}
          className={`min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-white/10 ${
            track.muted ? 'text-brand-secondary' : 'text-white/40'
          }`}
          aria-label={track.muted ? t('studio.unmute') : t('studio.mute')}
        >
          {track.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleTrackHidden(track.id);
          }}
          className={`min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-white/10 ${
            track.hidden ? 'text-brand-accent' : 'text-white/40'
          }`}
          aria-label={track.hidden ? t('studio.show') : t('studio.hide')}
        >
          {track.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleTrackLock(track.id);
          }}
          className={`min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-white/10 ${
            track.locked ? 'text-brand-secondary' : 'text-white/40'
          }`}
          aria-label={track.locked ? t('studio.unlock') : t('studio.lock')}
        >
          {track.locked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={track.type === 'video' && videoTrackCount <= 1}
          className="min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-brand-secondary/20 text-white/40 hover:text-brand-secondary disabled:opacity-30"
          aria-label={t('studio.tracks.remove')}
        >
          <Trash2 size={14} />
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
  const { selectedClipId, selectClip, updateClip, beginHistoryTransaction } =
    useStudioStore();
  const isSelected = selectedClipId === clip.id;

  const [isTrimming, setIsTrimming] = useState<'left' | 'right' | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const startXRef = useRef(0);
  const initialClipRef = useRef(clip);

  const handleTrimStart = (e: React.PointerEvent, edge: 'left' | 'right') => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    beginHistoryTransaction();
    setIsTrimming(edge);
    startXRef.current = e.clientX;
    initialClipRef.current = clip;
    selectClip(clip.id);
  };

  const handleDragStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    beginHistoryTransaction();
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
          orig.type !== 'text'
            ? (orig as MediaClip).mediaStart + deltaSeconds
            : 0;

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

        const updates: Partial<MediaClip> = {
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

  let bgClass = 'bg-surface-high';
  let icon = null;

  if (clip.type === 'video') {
    bgClass = 'bg-brand-blue/80';
    icon = <Video size={12} className="shrink-0 text-white" />;
  } else if (clip.type === 'image') {
    bgClass = 'bg-brand-accent/80';
    icon = <Image size={12} className="shrink-0 text-white" />;
  } else if (clip.type === 'audio') {
    bgClass = 'bg-brand-primary/80';
    icon = <Music size={12} className="shrink-0 text-white" />;
  } else if (clip.type === 'text') {
    bgClass = 'bg-brand-secondary/70';
    icon = <Type size={12} className="shrink-0 text-white" />;
  }

  return (
    <button
      type="button"
      onPointerDown={handleDragStart}
      className={`absolute top-1 bottom-1 rounded-xl overflow-hidden flex items-center cursor-grab active:cursor-grabbing transition-all border shadow-md ${
        isSelected
          ? 'border-white z-10 ring-2 ring-brand-primary ring-offset-2 ring-offset-surface-elevated scale-[1.01] brightness-110'
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
            ? (clip as { content: string }).content
            : clip.type.charAt(0).toUpperCase() + clip.type.slice(1)}
        </span>
      </div>

      {isSelected && (
        <button
          type="button"
          onPointerDown={(e) => handleTrimStart(e, 'left')}
          className="absolute left-0 top-0 bottom-0 w-11 min-w-11 bg-black/40 hover:bg-black/60 cursor-ew-resize touch-none flex items-center justify-center border-r border-white/40"
          aria-label="Trim start"
        >
          <div className="w-1 h-5 bg-white rounded-full shadow-sm" />
        </button>
      )}

      {isSelected && (
        <button
          type="button"
          onPointerDown={(e) => handleTrimStart(e, 'right')}
          className="absolute right-0 top-0 bottom-0 w-11 min-w-11 bg-black/40 hover:bg-black/60 cursor-ew-resize touch-none flex items-center justify-center border-l border-white/40"
          aria-label="Trim end"
        >
          <div className="w-1 h-5 bg-white rounded-full shadow-sm" />
        </button>
      )}
    </button>
  );
}
