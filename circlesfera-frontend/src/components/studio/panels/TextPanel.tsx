import { Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { TextClip } from '../../../types/studio';
import { STUDIO_DEFAULT_FONT_FAMILY } from '../../../utils/studioExportHelpers';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2);

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
    color: '#8c52ff',
    bg: 'rgba(140, 82, 255, 0.25)',
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
  const { project, playhead, addClip } = useStudioStore();

  const handlePreset = (
    content: string,
    fontSize: number,
    color: string,
    bg: string,
  ) => {
    if (!project) return;
    let trackId = project.tracks.find((tr) => tr.type === 'text')?.id;
    if (!trackId) trackId = project.tracks[0].id;

    const newClip: TextClip = {
      id: generateId(),
      trackId,
      type: 'text',
      startAt: playhead,
      duration: 3,
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

    addClip(trackId, newClip);
    toast.success(t('studio.text.added'));
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
          className="bg-white/5 hover:bg-brand-primary/20 border border-white/10 hover:border-brand-primary/50 rounded-xl p-3 text-left transition-all min-h-11"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white">
              {t(`studio.text.preset_${preset.key}`)}
            </span>
            <Plus size={14} className="text-white/40 shrink-0" aria-hidden />
          </div>
          <span className="text-[10px] text-white/40 mt-1 block truncate">
            “{t(`studio.text.preset_${preset.key}_content`)}”
          </span>
        </button>
      ))}
    </div>
  );
}
