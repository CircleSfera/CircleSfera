import { Volume2, VolumeX } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { MediaClip } from '../../../types/studio';
import { locateClip, MAX_CLIP_VOLUME } from '../../../utils/studioTimeline';

/** How loud the chosen video or sound is, or whether it is silent. */
export default function ClipVolumePanel() {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const selectedClipId = useStudioStore((s) => s.selectedClipId);
  const updateClip = useStudioStore((s) => s.updateClip);
  const beginHistoryTransaction = useStudioStore(
    (s) => s.beginHistoryTransaction,
  );
  // One step of undo for each drag or held key, and none for a touch that
  // changes nothing.
  const changing = useRef(false);
  const settle = () => {
    changing.current = false;
  };
  const found =
    project && selectedClipId ? locateClip(project, selectedClipId) : null;
  if (!found || found.clip.type === 'text') return null;
  const clip = found.clip as MediaClip;
  const percent = Math.round((clip.muted ? 0 : clip.volume) * 100);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() =>
          updateClip(
            clip.id,
            // Sound back on a clip silenced at zero comes back at its own
            // level, not at zero.
            clip.muted && clip.volume === 0
              ? { muted: false, volume: 1 }
              : { muted: !clip.muted },
            { history: true },
          )
        }
        aria-label={
          clip.muted ? t('studio.volume.unmute') : t('studio.volume.mute')
        }
        aria-pressed={clip.muted}
        className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10"
      >
        {clip.muted ? (
          <VolumeX size={18} aria-hidden />
        ) : (
          <Volume2 size={18} aria-hidden />
        )}
      </button>
      <input
        type="range"
        min={0}
        max={MAX_CLIP_VOLUME * 100}
        step={5}
        value={percent}
        aria-label={t('studio.properties.volume')}
        onPointerUp={settle}
        onKeyUp={settle}
        onBlur={settle}
        onChange={(e) => {
          const volume = Number(e.target.value) / 100;
          if (!changing.current) {
            changing.current = true;
            beginHistoryTransaction();
          }
          updateClip(clip.id, {
            volume,
            muted: volume === 0,
          } as Partial<MediaClip>);
        }}
        className="flex-1 accent-white h-11"
      />
      <span className="w-12 text-right text-sm font-mono text-white tabular-nums">
        {percent}%
      </span>
    </div>
  );
}
