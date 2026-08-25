import { FolderPlus, Image as ImageIcon } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import type { MediaClip } from '../../../types/studio';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2);

interface MediaPanelProps {
  onAddMediaFile: (file: File) => void;
}

export default function MediaPanel({ onAddMediaFile }: MediaPanelProps) {
  const { t } = useTranslation();
  const { project, playhead, addClip } = useStudioStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addSample = (fileUrl: string, name: string) => {
    if (!project) return;
    const trackId =
      project.tracks.find((tr) => tr.type === 'video')?.id ||
      project.tracks[0].id;
    const sampleClip: MediaClip = {
      id: generateId(),
      trackId,
      type: 'image',
      file: null,
      fileUrl,
      startAt: playhead,
      duration: 4,
      mediaStart: 0,
      speed: 1,
      volume: 1,
      muted: true,
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
    };
    addClip(trackId, sampleClip);
    toast.success(t('studio.media.sample_added', { name }));
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-full border-2 border-dashed border-white/15 hover:border-brand-primary/60 bg-white/3 hover:bg-brand-primary/5 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-all min-h-24"
      >
        <div className="w-11 h-11 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center">
          <FolderPlus size={20} />
        </div>
        <p className="text-sm font-semibold text-white">
          {t('studio.media.import')}
        </p>
        <span className="text-[11px] text-white/40 flex items-center gap-1">
          <ImageIcon size={10} /> {t('studio.media.formats')}
        </span>
      </button>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-white/70">
          {t('studio.media.samples')}
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              addSample(
                'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
                t('studio.media.sample_neon'),
              )
            }
            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-2.5 flex flex-col items-start gap-1 text-left min-h-11"
          >
            <div className="w-full h-16 rounded-lg overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80"
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-[11px] font-semibold text-white mt-1">
              {t('studio.media.sample_neon')}
            </span>
          </button>
          <button
            type="button"
            onClick={() =>
              addSample(
                'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=80',
                t('studio.media.sample_gradient'),
              )
            }
            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-2.5 flex flex-col items-start gap-1 text-left min-h-11"
          >
            <div className="w-full h-16 rounded-lg overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=400&auto=format&fit=crop&q=80"
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-[11px] font-semibold text-white mt-1">
              {t('studio.media.sample_gradient')}
            </span>
          </button>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files?.[0]) onAddMediaFile(e.target.files[0]);
          e.target.value = '';
        }}
        accept="video/*,image/*"
        className="hidden"
      />
    </div>
  );
}
