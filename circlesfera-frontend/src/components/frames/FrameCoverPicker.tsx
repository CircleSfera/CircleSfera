import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface FrameCoverPickerProps {
  /** The video of the frame. */
  src: string;
  /** The part of the video the frame keeps, when it was trimmed. */
  startSec?: number;
  endSec?: number;
  /** The chosen moment, counted from the start of the frame; none yet. */
  valueMs: number | null;
  onChange: (valueMs: number) => void;
}

const STEP_MS = 100;

const clock = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Chooses the cover of a frame as a moment of its own video: the picture
 * shows that moment while the slider moves along the frame.
 */
export default function FrameCoverPicker({
  src,
  startSec = 0,
  endSec,
  valueMs,
  onChange,
}: FrameCoverPickerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [durationSec, setDurationSec] = useState(0);

  const untilSec = endSec && endSec > startSec ? endSec : durationSec;
  const lengthMs = Math.max(0, Math.round((untilSec - startSec) * 1000));
  // Until the length is known the chosen moment is shown as it was stored.
  const shownMs =
    lengthMs > 0 ? Math.min(valueMs ?? 0, lengthMs) : (valueMs ?? 0);

  // The picture follows the chosen moment.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !durationSec) return;
    video.currentTime = startSec + shownMs / 1000;
  }, [shownMs, startSec, durationSec]);

  return (
    <div className="flex items-center gap-4">
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) =>
          setDurationSec(
            Number.isFinite(e.currentTarget.duration)
              ? e.currentTarget.duration
              : 0,
          )
        }
        className="h-40 w-[90px] shrink-0 rounded-xl border border-white/10 bg-black object-cover"
        aria-label={t('frames.cover.preview')}
      >
        <track kind="captions" />
      </video>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold text-white">
          {t('frames.cover.title')}
        </p>
        <p className="text-xs text-white/60">
          {valueMs === null
            ? t('frames.cover.automatic')
            : t('frames.cover.chosen', { time: clock(shownMs) })}
        </p>
        <input
          type="range"
          min={0}
          max={lengthMs}
          step={STEP_MS}
          value={shownMs}
          disabled={lengthMs === 0}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={t('frames.cover.slider')}
          aria-valuetext={clock(shownMs)}
          className="h-11 w-full cursor-pointer accent-brand-primary disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>
    </div>
  );
}
