import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { TransitionKind } from '../../../types/studio';
import { mainClips } from '../../../utils/studioTimeline';
import {
  DEFAULT_TRANSITION_SEC,
  fittedTransition,
  MAX_TRANSITION_SEC,
  MIN_TRANSITION_SEC,
  TRANSITION_KINDS,
  TRANSITION_STEP_SEC,
  transitionOf,
} from '../../../utils/studioTransitions';
import StudioSlider from './StudioSlider';

const chip = (on: boolean) =>
  `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${
    on
      ? 'bg-white text-black'
      : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
  }`;

/** How the chosen cut passes from one clip to the next. */
export default function TransitionPanel() {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const cut = useStudioStore((s) => s.selectedCut);
  const setTransition = useStudioStore((s) => s.setTransition);
  const setAllTransitions = useStudioStore((s) => s.setAllTransitions);
  const updateClip = useStudioStore((s) => s.updateClip);

  const ordered = project ? mainClips(project) : [];
  const index = ordered.findIndex((c) => c.id === cut);
  const clip = ordered[index];
  const next = ordered[index + 1];
  if (!clip || !next) return null;
  const current = transitionOf(clip);
  // The longest this cut takes: half of the shorter of its two clips.
  const longest =
    fittedTransition(
      { kind: 'crossfade', duration: MAX_TRANSITION_SEC },
      clip,
      next,
    )?.duration ?? 0;

  const choose = (kind: TransitionKind | null) =>
    setTransition(
      clip.id,
      kind
        ? {
            kind,
            duration: current?.duration ?? DEFAULT_TRANSITION_SEC,
          }
        : undefined,
    );

  return (
    <div className="flex flex-col items-start gap-4">
      {longest < MIN_TRANSITION_SEC && (
        <p className="text-sm text-white/60">
          {t('studio.transitions.too_short')}
        </p>
      )}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('studio.transitions.title')}</legend>
        <button
          type="button"
          aria-pressed={!current}
          onClick={() => choose(null)}
          className={chip(!current)}
        >
          {t('studio.transitions.none')}
        </button>
        {TRANSITION_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={current?.kind === kind}
            disabled={longest < MIN_TRANSITION_SEC}
            onClick={() => choose(kind)}
            className={`${chip(current?.kind === kind)} disabled:opacity-40`}
          >
            {t(`studio.transitions.${kind}`)}
          </button>
        ))}
      </fieldset>
      {current && (
        <div className="w-full max-w-sm">
          <StudioSlider
            label={t('studio.transitions.length')}
            min={MIN_TRANSITION_SEC}
            max={Math.max(MIN_TRANSITION_SEC, longest)}
            step={TRANSITION_STEP_SEC}
            value={current.duration}
            shown={`${current.duration.toFixed(1)} s`}
            onChange={(duration) =>
              updateClip(clip.id, {
                transitionOut: { ...current, duration },
              })
            }
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => setAllTransitions(current)}
        className="inline-flex min-h-11 items-center rounded-full bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
      >
        {t('studio.transitions.apply_all')}
      </button>
    </div>
  );
}
