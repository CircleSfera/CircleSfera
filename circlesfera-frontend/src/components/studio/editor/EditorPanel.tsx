import { MousePointerClick, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { Audio } from '../../../types';
import type { StudioPanel } from '../../../types/studio';
import PropertiesPanel from '../layout/PropertiesPanel';
import AudioPanel from '../panels/AudioPanel';
import BlendPanel from '../panels/BlendPanel';
import CaptionsPanel from '../panels/CaptionsPanel';
import ChromaPanel from '../panels/ChromaPanel';
import ClipFadesPanel from '../panels/ClipFadesPanel';
import ClipSpeedPanel from '../panels/ClipSpeedPanel';
import ClipVolumePanel from '../panels/ClipVolumePanel';
import ColorPanel from '../panels/ColorPanel';
import EffectsPanel from '../panels/EffectsPanel';
import FiltersPanel from '../panels/FiltersPanel';
import ProjectSettingsPanel from '../panels/ProjectSettingsPanel';
import TextPanel from '../panels/TextPanel';
import TransitionPanel from '../panels/TransitionPanel';
import VoicePanel, { type VoiceRecording } from '../panels/VoicePanel';

const TITLES: Record<StudioPanel, string> = {
  media: 'studio.tools.media',
  text: 'studio.tools.text',
  audio: 'studio.tools.audio',
  voice: 'studio.tools.voice',
  fades: 'studio.tools.fades',
  filters: 'studio.tools.filters',
  subtitles: 'studio.tools.captions',
  speed: 'studio.tools.speed',
  volume: 'studio.tools.volume',
  adjust: 'studio.tools.adjust',
  color: 'studio.tools.color',
  effects: 'studio.tools.effects',
  effect: 'studio.tools.effect',
  transition: 'studio.tools.transition',
  blend: 'studio.tools.blend',
  chroma: 'studio.tools.chroma',
  settings: 'studio.settings.title',
};

export interface PanelActions {
  onAddAudioFile: (file: File) => void;
  onAddLibraryAudio: (audio: Audio) => void;
  onRecorded: (recording: VoiceRecording) => void;
}

interface EditorPanelProps extends PanelActions {
  /** Over the timeline on a phone; a column beside the video on a wide screen. */
  variant: 'sheet' | 'side';
}

function PanelBody({
  panel,
  actions,
}: {
  panel: StudioPanel;
  actions: PanelActions;
}) {
  switch (panel) {
    case 'text':
      return <TextPanel />;
    case 'audio':
      return (
        <AudioPanel
          onAddAudioFile={actions.onAddAudioFile}
          onAddLibraryAudio={actions.onAddLibraryAudio}
        />
      );
    case 'voice':
      return <VoicePanel onRecorded={actions.onRecorded} />;
    case 'fades':
      return <ClipFadesPanel />;
    case 'filters':
      return <FiltersPanel />;
    case 'subtitles':
      return <CaptionsPanel />;
    case 'speed':
      return <ClipSpeedPanel />;
    case 'volume':
      return <ClipVolumePanel />;
    case 'adjust':
      return <PropertiesPanel />;
    case 'color':
      return <ColorPanel />;
    case 'effects':
    case 'effect':
      return <EffectsPanel />;
    case 'transition':
      return <TransitionPanel />;
    case 'blend':
      return <BlendPanel />;
    case 'chroma':
      return <ChromaPanel />;
    case 'settings':
      return <ProjectSettingsPanel />;
    default:
      return null;
  }
}

/** The panel of the tool that is open. */
export default function EditorPanel({ variant, ...actions }: EditorPanelProps) {
  const { t } = useTranslation();
  const panel = useStudioStore((s) => s.openSheet);
  const setOpenSheet = useStudioStore((s) => s.setOpenSheet);

  if (!panel) {
    if (variant === 'sheet') return null;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-white/40">
        <MousePointerClick size={24} aria-hidden />
        <p className="text-sm">{t('studio.panel_hint')}</p>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="studio-panel-title"
      className={
        variant === 'sheet'
          ? 'absolute inset-0 z-50 flex flex-col bg-surface-elevated border-t border-white/10 animate-in slide-up'
          : 'flex h-full flex-col'
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 h-12 border-b border-white/10">
        <h2 id="studio-panel-title" className="text-sm font-bold text-white">
          {t(TITLES[panel])}
        </h2>
        <button
          type="button"
          onClick={() => setOpenSheet(null)}
          aria-label={t('common.close')}
          className="min-h-11 min-w-11 -mr-2 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4">
        <PanelBody panel={panel} actions={actions} />
      </div>
    </section>
  );
}
