import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { parseFilter } from '../../utils/styleUtils';
import { Textarea } from '../ui';
import { SUBSCREEN_BODY, SUBSCREEN_SHELL } from './ComposerChrome';
import SubScreenHeader from './SubScreenHeader';

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
    <div className={SUBSCREEN_SHELL}>
      <SubScreenHeader
        title={t('createPost.accessibility.title')}
        subtitle={t('createPost.accessibility.subtitle')}
        onClose={onClose}
        trailing={
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 h-9 rounded-full bg-linear-to-r from-brand-primary to-brand-blue text-white font-semibold text-xs shrink-0 shadow-md shadow-brand-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          >
            {t('createPost.accessibility.done')}
          </button>
        }
      />

      <div className={SUBSCREEN_BODY}>
        <div className="px-2.5 py-2 rounded-lg bg-brand-primary/5 border border-brand-primary/10">
          <p className="text-white/50 text-[11px] font-medium leading-snug">
            {mediaFiles.every((m) => m.type === 'video')
              ? t('createPost.accessibility.info_video')
              : t('createPost.accessibility.info')}
          </p>
        </div>

        <div className="space-y-2">
          {mediaFiles.map((item, idx) => {
            const { className, style } = parseFilter(item.filter);
            const isGenerating = generatingIdx === idx;
            const isVideo = item.type === 'video';

            return (
              <div
                key={item.url}
                className="flex gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/8"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-white/10 relative">
                  {isVideo ? (
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
                    className="absolute top-0.5 right-0.5 w-7 h-7 min-w-7 min-h-7 bg-black/70 rounded-full flex items-center justify-center text-white border border-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <Textarea
                    rows={2}
                    value={altTextMap[idx] || ''}
                    onChange={(e) =>
                      setAltTextMap((prev) => ({
                        ...prev,
                        [idx]: e.target.value,
                      }))
                    }
                    placeholder={
                      isVideo
                        ? t('createPost.accessibility.placeholder_video')
                        : t('createPost.accessibility.placeholder')
                    }
                    className="resize-none text-sm min-h-[4.5rem]"
                  />

                  {!isVideo && (
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleAiGenerate(idx)}
                      className={`inline-flex items-center gap-1.5 min-h-9 px-2.5 rounded-lg border transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                        isGenerating
                          ? 'bg-surface-raised border-white/10 text-white/40'
                          : 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary hover:bg-brand-primary hover:text-white'
                      }`}
                    >
                      {isGenerating ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Sparkles size={12} />
                      )}
                      <span className="text-[10px] font-semibold uppercase tracking-wide">
                        {isGenerating
                          ? t('createPost.accessibility.generating')
                          : t('createPost.accessibility.magic_ai')}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
