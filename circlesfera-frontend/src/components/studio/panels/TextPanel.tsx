import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { TextClip } from '../../../types/studio';
import { STUDIO_DEFAULT_FONT_FAMILY } from '../../../utils/studioExportHelpers';
import {
  emptyTrack,
  newStudioId,
  TEXT_CLIP_SEC,
} from '../../../utils/studioTimeline';

const PRESETS = [
  {
    key: 'title',
    size: 52,
    color: '#ffffff',
    bg: 'rgba(0,0,0,0)',
  },
  {
    key: 'subtitle',
    size: 36,
    color: '#ec4899',
    bg: 'rgba(0,0,0,0.4)',
  },
  {
    key: 'badge',
    size: 28,
    color: '#884cff',
    bg: 'rgba(136, 76, 255, 0.25)',
  },
  {
    key: 'story',
    size: 32,
    color: '#ffffff',
    bg: 'rgba(0, 0, 0, 0.8)',
  },
] as const;

export default function TextPanel() {
  const { t } = useTranslation();
  const { project, playhead, addLayerClip, setOpenSheet } = useStudioStore();

  const handlePreset = (
    content: string,
    fontSize: number,
    color: string,
    bg: string,
  ) => {
    if (!project) return;

    const newClip: TextClip = {
      id: newStudioId(),
      trackId: '',
      type: 'text',
      startAt: playhead,
      duration: TEXT_CLIP_SEC,
      content,
      style: {
        fontFamily: STUDIO_DEFAULT_FONT_FAMILY,
        fontSize,
        color,
        backgroundColor: bg,
        padding: 8,
        borderRadius: 8,
        textAlign: 'center',
      },
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
    };

    // On the first text layer free there, chosen, and open to be written.
    addLayerClip('text', newClip, () =>
      emptyTrack('text', t('studio.tracks.text')),
    );
    setOpenSheet('adjust');
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-bold uppercase tracking-wider text-white/50">
        {t('studio.text.templates')}
      </span>
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          onClick={() =>
            handlePreset(
              t(`studio.text.preset_${preset.key}_content`),
              preset.size,
              preset.color,
              preset.bg,
            )
          }
          className="bg-white/5 hover:bg-brand-primary/20 border border-white/10 hover:border-brand-primary/50 rounded-2xl p-3 text-left transition-all min-h-11"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white">
              {t(`studio.text.preset_${preset.key}`)}
            </span>
            <Plus size={14} className="text-white/40 shrink-0" aria-hidden />
          </div>
          <span className="text-xs text-white/40 mt-1 block truncate">
            “{t(`studio.text.preset_${preset.key}_content`)}”
          </span>
        </button>
      ))}
    </div>
  );
}
