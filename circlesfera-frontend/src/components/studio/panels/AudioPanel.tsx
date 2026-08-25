import { Music } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface AudioPanelProps {
  onAddAudioFile: (file: File) => void;
}

export default function AudioPanel({ onAddAudioFile }: AudioPanelProps) {
  const { t } = useTranslation();
  const audioInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-bold uppercase tracking-wider text-white/50">
        {t('studio.audio.title')}
      </span>
      <button
        type="button"
        onClick={() => audioInputRef.current?.click()}
        className="w-full border border-brand-primary/30 hover:border-brand-primary/60 bg-brand-primary/10 hover:bg-brand-primary/20 rounded-xl p-3 flex items-center justify-center gap-2 transition-all text-brand-primary text-xs font-bold min-h-11"
      >
        <Music size={16} />
        <span>{t('studio.audio.upload')}</span>
      </button>
      <input
        type="file"
        ref={audioInputRef}
        onChange={(e) => {
          if (e.target.files?.[0]) onAddAudioFile(e.target.files[0]);
          e.target.value = '';
        }}
        accept="audio/*"
        className="hidden"
      />
    </div>
  );
}
