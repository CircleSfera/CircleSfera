import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { ColorAdjustments, MediaClip } from '../../../types/studio';
import {
  COLOR_KEYS,
  COLOR_LIMIT,
  NO_COLOR,
} from '../../../utils/studioEffects';
import { clipAt } from '../../../utils/studioKeyframes';
import { locateClip } from '../../../utils/studioTimeline';
import StudioSlider from './StudioSlider';

/** Brightness, contrast and the rest of the chosen video or photo. */
export default function ColorPanel() {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const selectedClipId = useStudioStore((s) => s.selectedClipId);
  const updateClip = useStudioStore((s) => s.updateClip);
  const found =
    project && selectedClipId ? locateClip(project, selectedClipId) : null;
  const playhead = useStudioStore((s) => s.playhead);
  // As it shows at the playhead, keyframes and all.
  const clip = found ? clipAt(found.clip, playhead - found.clip.startAt) : null;
  if (!clip || (clip.type !== 'video' && clip.type !== 'image')) return null;
  const color = (clip as MediaClip).color ?? NO_COLOR;
  const set = (next: ColorAdjustments, history = false) =>
    updateClip(clip.id, { color: next } as Partial<MediaClip>, { history });

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
        {COLOR_KEYS.map((key) => (
          <StudioSlider
            key={key}
            label={t(`studio.color.${key}`)}
            min={-COLOR_LIMIT}
            max={COLOR_LIMIT}
            step={1}
            value={color[key]}
            shown={`${color[key] > 0 ? '+' : ''}${color[key]}`}
            resetTo={0}
            onChange={(value) => set({ ...color, [key]: value })}
          />
        ))}
      </div>
      <button
        type="button"
        disabled={COLOR_KEYS.every((key) => color[key] === 0)}
        onClick={() => set(NO_COLOR, true)}
        className="self-start inline-flex min-h-11 items-center rounded-full bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-40"
      >
        {t('studio.color.reset')}
      </button>
    </div>
  );
}
