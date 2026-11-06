import {
  Captions,
  Check,
  Copy,
  Film,
  Gauge,
  type LucideIcon,
  Move,
  Music,
  Replace,
  Scissors,
  Trash2,
  Type,
  Volume2,
  Wand2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { Clip, StudioPanel } from '../../../types/studio';
import { locateClip } from '../../../utils/studioTimeline';

interface Tool {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  panel?: StudioPanel;
  run?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface EditorToolbarProps {
  onAddMedia: () => void;
  onReplace: () => void;
  onDuplicate: () => void;
}

/** The tools of the project, when no clip is chosen. */
export const PROJECT_TOOLS: Tool[] = [
  { id: 'media', icon: Film, labelKey: 'studio.tools.media' },
  { id: 'audio', icon: Music, labelKey: 'studio.tools.audio', panel: 'audio' },
  { id: 'text', icon: Type, labelKey: 'studio.tools.text', panel: 'text' },
  {
    id: 'subtitles',
    icon: Captions,
    labelKey: 'studio.tools.captions',
    panel: 'subtitles',
  },
];

// Whether the playhead is inside a clip, far enough from its ends to cut it.
function canSplit(clip: Clip, playhead: number): boolean {
  return (
    playhead > clip.startAt + 0.05 &&
    playhead < clip.startAt + clip.duration - 0.05
  );
}

/**
 * The bar at the bottom of the editor. With no clip chosen it holds the
 * tools of the project; with one, what can be done to that clip, and a
 * button that lets go of it.
 */
export default function EditorToolbar({
  onAddMedia,
  onReplace,
  onDuplicate,
}: EditorToolbarProps) {
  const { t } = useTranslation();
  const project = useStudioStore((s) => s.project);
  const selectedClipId = useStudioStore((s) => s.selectedClipId);
  const playhead = useStudioStore((s) => s.playhead);
  const openSheet = useStudioStore((s) => s.openSheet);
  const setOpenSheet = useStudioStore((s) => s.setOpenSheet);
  const selectClip = useStudioStore((s) => s.selectClip);
  const splitClip = useStudioStore((s) => s.splitClip);
  const removeClip = useStudioStore((s) => s.removeClip);

  const found =
    project && selectedClipId ? locateClip(project, selectedClipId) : null;
  const clip = found?.clip ?? null;

  let tools: Tool[];
  if (!clip) {
    tools = PROJECT_TOOLS.map((tool) =>
      tool.id === 'media' ? { ...tool, run: onAddMedia } : tool,
    );
  } else {
    const visual = clip.type === 'video' || clip.type === 'image';
    const timed = clip.type === 'video' || clip.type === 'audio';
    tools = [
      {
        id: 'split',
        icon: Scissors,
        labelKey: 'studio.split',
        run: splitClip,
        disabled: !canSplit(clip, playhead),
      },
      ...(timed
        ? [
            {
              id: 'speed',
              icon: Gauge,
              labelKey: 'studio.tools.speed',
              panel: 'speed' as const,
            },
          ]
        : []),
      ...(timed
        ? [
            {
              id: 'volume',
              icon: Volume2,
              labelKey: 'studio.tools.volume',
              panel: 'volume' as const,
            },
          ]
        : []),
      ...(visual
        ? [
            {
              id: 'filters',
              icon: Wand2,
              labelKey: 'studio.tools.filters',
              panel: 'filters' as const,
            },
          ]
        : []),
      {
        id: 'adjust',
        icon: clip.type === 'text' ? Type : Move,
        labelKey:
          clip.type === 'text'
            ? 'studio.tools.edit_text'
            : 'studio.tools.adjust',
        panel: 'adjust',
      },
      ...(clip.type !== 'text'
        ? [
            {
              id: 'replace',
              icon: Replace,
              labelKey: 'studio.tools.replace',
              run: onReplace,
            },
          ]
        : []),
      {
        id: 'duplicate',
        icon: Copy,
        labelKey: 'studio.tools.duplicate',
        run: onDuplicate,
      },
      {
        id: 'delete',
        icon: Trash2,
        labelKey: 'studio.delete',
        run: () => removeClip(clip.id),
        destructive: true,
      },
    ];
  }

  return (
    <nav
      aria-label={
        clip ? t('studio.tools.clip_label') : t('studio.tools.dock_label')
      }
      className="shrink-0 border-t border-white/10 bg-surface-base safe-area-bottom"
    >
      <div className="flex items-stretch justify-start gap-1 overflow-x-auto no-scrollbar px-2 py-1.5 md:justify-center">
        {clip && (
          <button
            type="button"
            onClick={() => selectClip(null)}
            aria-label={t('studio.tools.done')}
            className="flex shrink-0 flex-col items-center justify-center gap-1 min-h-14 min-w-16 rounded-2xl px-2 text-xs font-semibold text-white bg-white/10"
          >
            <Check size={20} aria-hidden />
            <span>{t('studio.tools.done')}</span>
          </button>
        )}
        {tools.map((tool) => {
          const Icon = tool.icon;
          const active = tool.panel !== undefined && openSheet === tool.panel;
          return (
            <button
              key={tool.id}
              type="button"
              disabled={tool.disabled}
              aria-pressed={tool.panel ? active : undefined}
              onClick={() => {
                if (tool.run) tool.run();
                else if (tool.panel) setOpenSheet(active ? null : tool.panel);
              }}
              className={`flex shrink-0 flex-col items-center justify-center gap-1 min-h-14 min-w-16 rounded-2xl px-2 text-xs font-semibold transition-colors disabled:opacity-30 ${
                active
                  ? 'bg-brand-primary/15 text-brand-primary-text'
                  : tool.destructive
                    ? 'text-brand-secondary hover:bg-brand-secondary/10'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={20} aria-hidden />
              <span className="whitespace-nowrap">{t(tool.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
