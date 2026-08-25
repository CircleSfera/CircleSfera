import { ChevronLeft, Loader2, Sparkles, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { parseFilter } from '../../utils/styleUtils';
import { Textarea } from '../ui';

interface AccessibilitySubScreenProps {
  mediaFiles: Array<{ url: string; file: File; type: string; filter?: string }>;
  altTextMap: Record<number, string>;
  setAltTextMap: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  onRemoveFile: (index: number) => void;
  onClose: () => void;
  onGenerateAltText: (index: number) => Promise<void>;
}

export default function AccessibilitySubScreen({
  mediaFiles,
  altTextMap,
  setAltTextMap,
  onRemoveFile,
  onClose,
  onGenerateAltText,
}: AccessibilitySubScreenProps) {
  const { t } = useTranslation();
  const [generatingIdx, setGeneratingIdx] = React.useState<number | null>(null);

  const handleAiGenerate = async (idx: number) => {
    setGeneratingIdx(idx);
    try {
      await onGenerateAltText(idx);
    } finally {
      setGeneratingIdx(null);
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-surface-base flex flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-2 h-(--nav-top-height,52px) bg-surface-elevated border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 flex items-center justify-center text-white hover:bg-white/8 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            aria-label={t('createPost.header.back')}
          >
            <ChevronLeft size={22} strokeWidth={2} />
          </button>
          <div className="min-w-0">
            <h2 className="font-bold text-base text-white truncate">
              {t('createPost.accessibility.title')}
            </h2>
            <p className="text-white/40 text-xs truncate">
              {t('createPost.accessibility.subtitle')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-4 h-11 rounded-full bg-white text-black font-bold text-sm shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          {t('createPost.accessibility.done')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="p-3 rounded-xl bg-brand-primary/5 border border-brand-primary/10">
          <p className="text-white/50 text-xs font-medium leading-relaxed">
            {t('createPost.accessibility.info')}
          </p>
        </div>

        <div className="space-y-3">
          {mediaFiles.map((item, idx) => {
            const { className, style } = parseFilter(item.filter);
            const isGenerating = generatingIdx === idx;

            return (
              <div
                key={item.url}
                className="flex flex-col gap-3 p-3 rounded-xl bg-white/5 border border-white/8"
              >
                <div className="flex gap-3">
                  <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 border border-white/10 relative">
                    {item.type === 'video' ? (
                      <video
                        src={item.url}
                        className={`w-full h-full object-cover ${className}`}
                        style={style}
                        muted
                        playsInline
                      >
                        <track kind="captions" />
                      </video>
                    ) : (
                      <img
                        src={item.url}
                        alt=""
                        className={`w-full h-full object-cover ${className}`}
                        style={style}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveFile(idx)}
                      aria-label={t('createPost.edit.remove_media')}
                      className="absolute top-1 right-1 w-8 h-8 min-w-8 min-h-8 bg-black/70 rounded-full flex items-center justify-center text-white border border-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    >
                      <Trash2 size={14} strokeWidth={2.5} />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <Textarea
                      rows={3}
                      value={altTextMap[idx] || ''}
                      onChange={(e) =>
                        setAltTextMap((prev) => ({
                          ...prev,
                          [idx]: e.target.value,
                        }))
                      }
                      placeholder={t('createPost.accessibility.placeholder')}
                      className="resize-none text-base"
                    />

                    {item.type === 'image' && (
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() => handleAiGenerate(idx)}
                        className={`inline-flex items-center gap-2 min-h-11 px-3 rounded-xl border transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                          isGenerating
                            ? 'bg-surface-raised border-white/10 text-white/40'
                            : 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary hover:bg-brand-primary hover:text-white'
                        }`}
                      >
                        {isGenerating ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Sparkles size={14} />
                        )}
                        <span className="text-xs font-bold uppercase tracking-wide">
                          {isGenerating
                            ? t('createPost.accessibility.generating')
                            : t('createPost.accessibility.magic_ai')}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
