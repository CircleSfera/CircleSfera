import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { EffectClip, EffectKind } from '../../../types/studio';
import {
  DEFAULT_EFFECT_INTENSITY,
  EFFECT_CLIP_SEC,
  EFFECT_KINDS,
} from '../../../utils/studioEffects';
import {
  emptyTrack,
  locateClip,
  MIN_CLIP_SEC,
  newStudioId,
} from '../../../utils/studioTimeline';
import StudioSlider from './StudioSlider';

const chip = (on: boolean) =>
  `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${
    on
      ? 'bg-white text-black'
      : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
  }`;

/**
 * The effects: with none chosen, picking one adds it at the playhead on an
 * effects layer; with an effect chosen, its intensity, and another effect
 * in its place.
 */
export default function EffectsPanel() {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const playhead = useStudioStore((s) => s.playhead);
  const selectedClipId = useStudioStore((s) => s.selectedClipId);
  const addLayerClip = useStudioStore((s) => s.addLayerClip);
  const updateClip = useStudioStore((s) => s.updateClip);
  const setOpenSheet = useStudioStore((s) => s.setOpenSheet);
  if (!project) return null;

  const found = selectedClipId ? locateClip(project, selectedClipId) : null;
  const chosen =
    found?.clip.type === 'effect' ? (found.clip as EffectClip) : null;

  const add = (effect: EffectKind) => {
    const left = project.duration - playhead;
    const clip: EffectClip = {
      id: newStudioId(),
      type: 'effect',
      trackId: '',
      effect,
      intensity: DEFAULT_EFFECT_INTENSITY,
      startAt: playhead,
      duration: Math.max(MIN_CLIP_SEC, Math.min(EFFECT_CLIP_SEC, left)),
    };
    addLayerClip('effect', clip, () =>
      emptyTrack('effect', t('studio.tracks.effects')),
    );
    setOpenSheet('effect');
  };

  return (
    <div className="flex flex-col items-start gap-4">
      {chosen && (
        <div className="w-full max-w-sm">
          <StudioSlider
            label={t('studio.effects.intensity')}
            min={0}
            max={100}
            step={1}
            value={chosen.intensity}
            shown={`${chosen.intensity}`}
            resetTo={DEFAULT_EFFECT_INTENSITY}
            onChange={(intensity) =>
              updateClip(chosen.id, { intensity } as Partial<EffectClip>)
            }
          />
        </div>
      )}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm text-white/60">
          {chosen ? t('studio.effects.replace') : t('studio.effects.add_hint')}
        </legend>
        {EFFECT_KINDS.map((effect) => (
          <button
            key={effect}
            type="button"
            aria-pressed={chosen ? chosen.effect === effect : undefined}
            onClick={() =>
              chosen
                ? updateClip(chosen.id, { effect } as Partial<EffectClip>, {
                    history: true,
                  })
                : add(effect)
            }
            className={chip(chosen?.effect === effect)}
          >
            {t(`studio.effects.${effect}`)}
          </button>
        ))}
      </fieldset>
    </div>
  );
}
