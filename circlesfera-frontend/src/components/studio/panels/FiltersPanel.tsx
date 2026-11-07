import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { MediaClip } from '../../../types/studio';
import { locateClip } from '../../../utils/studioTimeline';
import StudioSlider from './StudioSlider';

export const FILTERS = [
  { key: 'normal', filter: '' },
  { key: 'bw', filter: 'grayscale(1) contrast(1.2)' },
  { key: 'sepia', filter: 'sepia(0.8) contrast(1.1)' },
  { key: 'neon', filter: 'hue-rotate(90deg) saturate(1.8)' },
  { key: 'drama', filter: 'contrast(1.5) saturate(1.3)' },
  { key: 'invert', filter: 'invert(0.9)' },
] as const;

/** The colour filter of the chosen video or photo, and how much of it shows. */
export default function FiltersPanel() {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const selectedClipId = useStudioStore((s) => s.selectedClipId);
  const updateClip = useStudioStore((s) => s.updateClip);

  // A filter changes how a picture looks: text, sound and effects have none.
  const found =
    project && selectedClipId ? locateClip(project, selectedClipId) : null;
  const clip =
    found && (found.clip.type === 'video' || found.clip.type === 'image')
      ? (found.clip as MediaClip)
      : null;
  if (!clip) {
    return (
      <p className="py-2 text-center text-xs text-white/40">
        {t('studio.filters.select_clip')}
      </p>
    );
  }
  const current = clip.filter ?? '';
  const intensity = clip.filterIntensity ?? 100;

  return (
    <div className="flex flex-col items-start gap-4">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('studio.filters.title')}</legend>
        {FILTERS.map((f) => {
          const on = current === f.filter;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() =>
                updateClip(
                  clip.id,
                  { filter: f.filter } as Partial<MediaClip>,
                  { history: true },
                )
              }
              className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${
                on
                  ? 'bg-white text-black'
                  : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
              }`}
            >
              {t(`studio.filters.${f.key}`)}
            </button>
          );
        })}
      </fieldset>
      {current && (
        <div className="w-full max-w-sm">
          <StudioSlider
            label={t('studio.filters.intensity')}
            min={0}
            max={100}
            step={1}
            value={intensity}
            shown={`${intensity}`}
            resetTo={100}
            onChange={(value) =>
              updateClip(clip.id, {
                filterIntensity: value,
              } as Partial<MediaClip>)
            }
          />
        </div>
      )}
    </div>
  );
}
