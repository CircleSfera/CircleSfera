import { Loader2, Sparkles } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { parseFilter } from '../../utils/styleUtils';
import { Textarea } from '../ui';
import { SUBSCREEN_BODY, SUBSCREEN_SHELL } from './ComposerChrome';
import { CREATE_THUMB, createThumbRatio } from './createStyles';
import { EditorHeaderAction } from './EditorHeader';
import SubScreenHeader from './SubScreenHeader';

interface AccessibilitySubScreenProps {
  mediaFiles: Array<{ url: string; file: File; type: string; filter?: string }>;
  altTextMap: Record<number, string>;
  setAltTextMap: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  onClose: () => void;
  onGenerateAltText: (index: number) => Promise<void>;
  /** What is being created: its preview has the shape of that format. */
  mode?: 'POST' | 'FRAME' | 'STORY';
}

export default function AccessibilitySubScreen({
  mediaFiles,
  altTextMap,
  setAltTextMap,
  onClose,
  onGenerateAltText,
  mode = 'POST',
}: AccessibilitySubScreenProps) {
  // The same small preview as the strip of the edit step: same height, same
  // shape for the format, same corners.
  const previewRatio = createThumbRatio(mode);
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
          <EditorHeaderAction
            label={t('createPost.accessibility.done')}
            onClick={onClose}
          />
        }
      />

      <div className={SUBSCREEN_BODY}>
        <div className="px-4 py-3 rounded-2xl bg-brand-primary/5 border border-brand-primary/10">
          <p className="text-white/50 text-xs font-medium leading-snug">
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
                className="flex gap-2.5 p-2.5 rounded-3xl bg-white/5 border border-white/8"
              >
                <div
                  className={`${CREATE_THUMB} border-white/10 relative`}
                  style={{ aspectRatio: previewRatio }}
                >
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
                      className={`inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full border transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                        isGenerating
                          ? 'bg-surface-raised border-white/10 text-white/40'
                          : 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary hover:bg-brand-primary hover:text-white'
                      }`}
                    >
                      {isGenerating ? (
                        <Loader2
                          size={16}
                          className="animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <Sparkles size={16} aria-hidden />
                      )}
                      <span className="text-sm font-semibold">
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
