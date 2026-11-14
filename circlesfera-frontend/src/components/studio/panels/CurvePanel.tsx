import { Lock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioPro } from '../../../hooks/useStudioPro';
import { useStudioStore } from '../../../stores/studioStore';
import {
  BEZIER_X,
  BEZIER_Y,
  bezier,
  CURVE_PRESETS,
  type CurvePreset,
  curveValue,
  FREE_CURVE,
  isBezier,
  isProCurve,
  type KeyCurve,
} from '../../../utils/studioCurves';
import { curveAt, hasKeyframeAt } from '../../../utils/studioKeyframes';
import { locateClip } from '../../../utils/studioTimeline';

const STEPS = 48;
// A Bézier like the usual "ease" to start a curve of one's own from.
const START = bezier(0.25, 0.1, 0.25, 1);

// The curve drawn in a box: x across, y up, with room above and below for
// curves that go past the end.
function CurvePath({ curve, size }: { curve: KeyCurve; size: number }) {
  const pad = size * 0.25;
  const inner = size - pad * 2;
  const points = Array.from({ length: STEPS + 1 }, (_, i) => {
    const u = i / STEPS;
    const x = pad + u * inner;
    const y = pad + (1 - curveValue(curve, u)) * inner;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      aria-hidden
      className="shrink-0"
    >
      <rect
        x={pad}
        y={pad}
        width={inner}
        height={inner}
        className="fill-none stroke-white/15"
      />
      <polyline
        points={points.join(' ')}
        className="fill-none stroke-current"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * How the values of the chosen clip go from its keyframes at the playhead to
 * the next ones. Ease in and out is free; the other curves and a curve of
 * one's own come with Edits Studio Pro. A curve already in a project stays,
 * with or without Pro: only choosing a new one needs it.
 */
export default function CurvePanel() {
  const { t } = useTranslation();
  const { pro } = useStudioPro();
  const project = useStudioStore((s) => s.project);
  const selectedClipId = useStudioStore((s) => s.selectedClipId);
  const playhead = useStudioStore((s) => s.playhead);
  const setKeyframeCurve = useStudioStore((s) => s.setKeyframeCurve);
  const found =
    project && selectedClipId ? locateClip(project, selectedClipId) : null;
  const local = found ? playhead - found.clip.startAt : -1;
  const current =
    found && hasKeyframeAt(found.clip, local)
      ? (curveAt(found.clip, local) ?? FREE_CURVE)
      : null;
  const [own, setOwn] = useState<KeyCurve>(
    current && isBezier(current) ? current : START,
  );
  if (!found || current === null) {
    return (
      <p className="text-sm text-white/60">{t('studio.curves.no_keyframe')}</p>
    );
  }
  const clipId = found.clip.id;
  const choose = (curve: KeyCurve) => {
    if (isProCurve(curve) && !pro) return;
    setKeyframeCurve(clipId, curve);
  };
  const ownCurve = own && isBezier(own) ? own : START;
  const [x1, y1, x2, y2] = ownCurve.bezier;
  const setPoint = (i: number, v: number) => {
    const next = [...ownCurve.bezier] as [number, number, number, number];
    next[i] = v;
    const curve = bezier(...next);
    setOwn(curve);
    choose(curve);
  };
  const sliders: [string, number, number, readonly [number, number]][] = [
    ['x1', 0, x1, BEZIER_X],
    ['y1', 1, y1, BEZIER_Y],
    ['x2', 2, x2, BEZIER_X],
    ['y2', 3, y2, BEZIER_Y],
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-white/60">{t('studio.curves.hint')}</p>
      {!pro ? (
        <p className="text-xs text-white/70" data-testid="curves-pro-note">
          {t('studio.curves.pro_note')}
        </p>
      ) : null}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('studio.curves.title')}</legend>
        {CURVE_PRESETS.map((preset: CurvePreset) => {
          const locked = isProCurve(preset) && !pro;
          const chosen = current === preset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={chosen}
              disabled={locked}
              onClick={() => choose(preset)}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-2 pr-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                chosen
                  ? 'bg-white text-black'
                  : 'bg-white/5 text-white hover:bg-white/10'
              }`}
            >
              <CurvePath curve={preset} size={28} />
              {t(`studio.curves.presets.${preset}`)}
              {locked ? <Lock size={12} aria-hidden /> : null}
            </button>
          );
        })}
      </fieldset>

      <section className="flex flex-col gap-3" aria-labelledby="own-curve">
        <div className="flex items-center gap-2">
          <h3 id="own-curve" className="text-sm font-semibold text-white">
            {t('studio.curves.own')}
          </h3>
          {!pro ? (
            <Lock size={12} className="text-white/60" aria-hidden />
          ) : null}
        </div>
        <div
          className={`flex items-start gap-4 ${isBezier(current ?? undefined) ? 'text-white' : 'text-white/50'}`}
        >
          <CurvePath curve={ownCurve} size={96} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {sliders.map(([name, index, value, [min, max]]) => (
              <label key={name} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-white/60">{name}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={0.01}
                  value={value}
                  disabled={!pro}
                  aria-label={t('studio.curves.point', { name })}
                  onChange={(e) => setPoint(index, Number(e.target.value))}
                  className="h-11 min-w-0 flex-1 accent-brand-primary disabled:opacity-50"
                />
                <span className="w-10 text-right tabular-nums text-white/70">
                  {value.toFixed(2)}
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
