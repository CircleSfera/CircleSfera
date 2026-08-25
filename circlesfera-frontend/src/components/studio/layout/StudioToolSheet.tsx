import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { useStudioStore } from '../../../stores/studioStore';
import AudioPanel from '../panels/AudioPanel';
import CaptionsPanel from '../panels/CaptionsPanel';
import FiltersPanel from '../panels/FiltersPanel';
import MediaPanel from '../panels/MediaPanel';
import TextPanel from '../panels/TextPanel';
import PropertiesPanel from './PropertiesPanel';

interface StudioToolSheetProps {
  onAddMediaFile: (file: File) => void;
  onAddAudioFile: (file: File) => void;
}

const TITLES: Record<string, string> = {
  media: 'studio.tools.media',
  text: 'studio.tools.text',
  audio: 'studio.tools.audio',
  filters: 'studio.tools.filters',
  subtitles: 'studio.tools.captions',
  properties: 'studio.properties.title',
};

export default function StudioToolSheet({
  onAddMediaFile,
  onAddAudioFile,
}: StudioToolSheetProps) {
  const { t } = useTranslation();
  const { openSheet, setOpenSheet, selectedClipId } = useStudioStore();

  const isOpen = openSheet !== null;
  const sheetRef = useFocusTrap<HTMLDivElement>(isOpen, undefined, {
    onEscape: () => setOpenSheet(null),
  });

  if (!isOpen) return null;

  const titleKey = TITLES[openSheet] || 'studio.tools.media';

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex flex-col justify-end pointer-events-none">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 pointer-events-auto border-0 cursor-default"
        aria-label={t('common.cancel', 'Cancel')}
        onClick={() => setOpenSheet(null)}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-sheet-title"
        tabIndex={-1}
        className="relative pointer-events-auto max-h-[55vh] md:max-h-[50vh] md:max-w-2xl md:mx-auto w-full rounded-t-2xl border border-white/10 border-b-0 bg-surface-elevated shadow-2xl flex flex-col animate-in slide-up"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20 absolute left-1/2 -translate-x-1/2 top-2 md:hidden" />
          <h2
            id="studio-sheet-title"
            className="text-sm font-bold text-white pt-1"
          >
            {t(titleKey)}
          </h2>
          <button
            type="button"
            onClick={() => setOpenSheet(null)}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10"
            aria-label={t('common.cancel', 'Cancel')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] no-scrollbar">
          {openSheet === 'media' && (
            <MediaPanel onAddMediaFile={onAddMediaFile} />
          )}
          {openSheet === 'text' && <TextPanel />}
          {openSheet === 'audio' && (
            <AudioPanel onAddAudioFile={onAddAudioFile} />
          )}
          {openSheet === 'filters' && <FiltersPanel />}
          {openSheet === 'subtitles' && <CaptionsPanel />}
          {openSheet === 'properties' &&
            (selectedClipId ? (
              <PropertiesPanel />
            ) : (
              <p className="text-sm text-white/50 text-center py-8">
                {t('studio.select_clip_hint')}
              </p>
            ))}
        </div>
      </div>
    </div>
  );
}
