import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { BlendMode, ClipShape, MediaClip } from '../../../types/studio';
import {
  BLEND_MODES,
  CLIP_SHAPES,
  isOverlayClip,
} from '../../../utils/studioOverlay';
import { locateClip } from '../../../utils/studioTimeline';

const chip = (on: boolean) =>
  `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${
    on
      ? 'bg-white text-black'
      : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
  }`;

/** How the chosen layer mixes with what is under it, and its shape. */
export default function BlendPanel() {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const selectedClipId = useStudioStore((s) => s.selectedClipId);
  const updateClip = useStudioStore((s) => s.updateClip);
  const found =
    project && selectedClipId ? locateClip(project, selectedClipId) : null;
  const clip = found?.clip;
  if (
    !project ||
    !clip ||
    (clip.type !== 'video' && clip.type !== 'image') ||
    !isOverlayClip(project, clip.id)
  ) {
    return null;
  }
  const media = clip as MediaClip;
  const blend = media.blend ?? 'normal';
  const shape = media.shape ?? 'none';
  const set = (change: { blend?: BlendMode; shape?: ClipShape }) =>
    updateClip(clip.id, change as Partial<MediaClip>, { history: true });

  return (
    <div className="flex flex-col items-start gap-4">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm text-white/60">
          {t('studio.blend.mode')}
        </legend>
        {BLEND_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={blend === mode}
            onClick={() => set({ blend: mode })}
            className={chip(blend === mode)}
          >
            {t(`studio.blend.modes.${mode}`)}
          </button>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm text-white/60">
          {t('studio.blend.shape')}
        </legend>
        {CLIP_SHAPES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={shape === option}
            onClick={() => set({ shape: option })}
            className={chip(shape === option)}
          >
            {t(`studio.blend.shapes.${option}`)}
          </button>
        ))}
      </fieldset>
    </div>
  );
}
