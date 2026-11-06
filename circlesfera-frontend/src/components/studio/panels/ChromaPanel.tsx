import { Pipette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { ChromaKey, MediaClip } from '../../../types/studio';
import {
  BLUE_SCREEN,
  DEFAULT_CHROMA_SOFTNESS,
  DEFAULT_CHROMA_STRENGTH,
  GREEN_SCREEN,
  isOverlayClip,
} from '../../../utils/studioOverlay';
import { locateClip } from '../../../utils/studioTimeline';
import StudioSlider from './StudioSlider';

const chip = (on: boolean) =>
  `inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ${
    on
      ? 'bg-white text-black'
      : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
  }`;

/** The green screen of the chosen layer: its colour, strength and edge. */
export default function ChromaPanel() {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const selectedClipId = useStudioStore((s) => s.selectedClipId);
  const updateClip = useStudioStore((s) => s.updateClip);
  const picking = useStudioStore((s) => s.pickingColor);
  const setPicking = useStudioStore((s) => s.setPickingColor);
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
  const chroma = (clip as MediaClip).chroma;
  const set = (next: ChromaKey | undefined, history = true) =>
    updateClip(clip.id, { chroma: next } as Partial<MediaClip>, { history });
  const withColor = (color: string) =>
    set({
      color,
      strength: chroma?.strength ?? DEFAULT_CHROMA_STRENGTH,
      softness: chroma?.softness ?? DEFAULT_CHROMA_SOFTNESS,
    });
  const preset = (color: string) => chroma?.color === color;
  const custom =
    Boolean(chroma) && !preset(GREEN_SCREEN) && !preset(BLUE_SCREEN);

  return (
    <div className="flex flex-col items-start gap-4">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('studio.chroma.color')}</legend>
        <button
          type="button"
          aria-pressed={!chroma}
          onClick={() => set(undefined)}
          className={chip(!chroma)}
        >
          {t('studio.chroma.off')}
        </button>
        <button
          type="button"
          aria-pressed={preset(GREEN_SCREEN)}
          onClick={() => withColor(GREEN_SCREEN)}
          className={chip(preset(GREEN_SCREEN))}
        >
          {t('studio.chroma.green')}
        </button>
        <button
          type="button"
          aria-pressed={preset(BLUE_SCREEN)}
          onClick={() => withColor(BLUE_SCREEN)}
          className={chip(preset(BLUE_SCREEN))}
        >
          {t('studio.chroma.blue')}
        </button>
        <button
          type="button"
          aria-pressed={picking}
          onClick={() => setPicking(!picking)}
          className={chip(picking || custom)}
        >
          {custom && chroma ? (
            <span
              className="h-4 w-4 rounded-full border border-white/40"
              style={{ backgroundColor: chroma.color }}
              aria-hidden
            />
          ) : (
            <Pipette size={16} aria-hidden />
          )}
          {t('studio.chroma.pick')}
        </button>
      </fieldset>
      {picking && (
        <p className="text-sm text-white/60">{t('studio.chroma.pick_hint')}</p>
      )}
      {chroma && (
        <div className="flex w-full max-w-sm flex-col gap-1">
          <StudioSlider
            label={t('studio.chroma.strength')}
            min={0}
            max={100}
            step={1}
            value={chroma.strength}
            shown={`${chroma.strength}`}
            resetTo={DEFAULT_CHROMA_STRENGTH}
            onChange={(strength) => set({ ...chroma, strength }, false)}
          />
          <StudioSlider
            label={t('studio.chroma.softness')}
            min={0}
            max={100}
            step={1}
            value={chroma.softness}
            shown={`${chroma.softness}`}
            resetTo={DEFAULT_CHROMA_SOFTNESS}
            onChange={(softness) => set({ ...chroma, softness }, false)}
          />
        </div>
      )}
    </div>
  );
}
