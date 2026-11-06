import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { MediaClip } from '../../../types/studio';
import { FADE_STEP_SEC, MAX_FADE_SEC } from '../../../utils/studioAudio';
import { locateClip } from '../../../utils/studioTimeline';

/** How the sound of the chosen clip rises at its start and falls at its end. */
export default function ClipFadesPanel() {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const selectedClipId = useStudioStore((s) => s.selectedClipId);
  const setClipFades = useStudioStore((s) => s.setClipFades);
  const beginHistoryTransaction = useStudioStore(
    (s) => s.beginHistoryTransaction,
  );
  // One step of undo for each drag, and none for a touch that changes
  // nothing.
  const changing = useRef(false);
  const settle = () => {
    changing.current = false;
  };
  const found =
    project && selectedClipId ? locateClip(project, selectedClipId) : null;
  if (!found || found.clip.type === 'text' || found.clip.type === 'image') {
    return null;
  }
  const clip = found.clip as MediaClip;
  // A fade takes at most half the clip, so the two never cross.
  const most = Math.min(MAX_FADE_SEC, clip.duration / 2);

  const row = (key: 'fadeIn' | 'fadeOut', label: string) => (
    <label className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-white/70">{label}</span>
      <input
        type="range"
        min={0}
        max={most}
        step={FADE_STEP_SEC}
        value={clip[key] ?? 0}
        onPointerUp={settle}
        onKeyUp={settle}
        onBlur={settle}
        onChange={(e) => {
          if (!changing.current) {
            changing.current = true;
            beginHistoryTransaction();
          }
          setClipFades(
            clip.id,
            { [key]: Number(e.target.value) },
            { history: false },
          );
        }}
        className="h-11 flex-1 accent-white"
      />
      <span className="w-12 text-right text-sm font-mono tabular-nums text-white">
        {(clip[key] ?? 0).toFixed(1)} s
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-2">
      {row('fadeIn', t('studio.fades.in'))}
      {row('fadeOut', t('studio.fades.out'))}
    </div>
  );
}
