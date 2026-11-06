import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { MediaClip } from '../../../types/studio';
import { CLIP_SPEEDS, locateClip } from '../../../utils/studioTimeline';

/** How fast the chosen video or sound plays. */
export default function ClipSpeedPanel() {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const selectedClipId = useStudioStore((s) => s.selectedClipId);
  const setClipSpeed = useStudioStore((s) => s.setClipSpeed);
  const found =
    project && selectedClipId ? locateClip(project, selectedClipId) : null;
  if (!found || found.clip.type === 'text') return null;
  const clip = found.clip as MediaClip;
  const speed = clip.speed || 1;

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('studio.tools.speed')}</legend>
        {CLIP_SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={speed === value}
            onClick={() => setClipSpeed(clip.id, value)}
            className={`min-h-11 min-w-14 rounded-full px-3 text-sm font-bold transition-colors ${
              speed === value
                ? 'bg-white text-black'
                : 'bg-white/5 text-white hover:bg-white/10'
            }`}
          >
            {value}×
          </button>
        ))}
      </fieldset>
      <p className="text-xs text-white/50">
        {t('studio.speed.length', { seconds: clip.duration.toFixed(1) })}
      </p>
    </div>
  );
}
