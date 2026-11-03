import { ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaFile } from '../../hooks/useCreatePost';
import FrameCoverImageCrop from '../frames/FrameCoverImageCrop';
import FrameCoverPicker from '../frames/FrameCoverPicker';
import { SUBSCREEN_BODY, SUBSCREEN_SHELL } from './ComposerChrome';
import { CREATE_SECONDARY } from './createStyles';
import SubScreenHeader from './SubScreenHeader';

interface CoverSubScreenProps {
  mediaFiles: MediaFile[];
  coverTimeMs: number | null;
  setCoverTimeMs: (value: number | null) => void;
  /** An image chosen as the cover instead of a moment, framed at 9:16. */
  coverImage: File | null;
  setCoverImage: (value: File | null) => void;
  onClose: () => void;
}

/**
 * The cover of a new frame: a moment of the video being published, or an
 * image from the gallery, as on Reels. Choosing one drops the other.
 */
export default function CoverSubScreen({
  mediaFiles,
  coverTimeMs,
  setCoverTimeMs,
  coverImage,
  setCoverImage,
  onClose,
}: CoverSubScreenProps) {
  const { t } = useTranslation();
  const video = mediaFiles.find((m) => m.type === 'video');
  const fileInput = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);

  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => {
    if (!coverImage) {
      setImageUrl('');
      return;
    }
    const made = URL.createObjectURL(coverImage);
    setImageUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [coverImage]);

  return (
    <div className={SUBSCREEN_SHELL}>
      <SubScreenHeader title={t('frames.cover.title')} onClose={onClose} />
      <div className={SUBSCREEN_BODY}>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="frame-cover-image-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) setPicked(file);
          }}
        />
        {picked ? (
          <div className="rounded-3xl border border-white/8 bg-white/2 p-4">
            <FrameCoverImageCrop
              file={picked}
              onCancel={() => setPicked(null)}
              onDone={(cover) => {
                setPicked(null);
                setCoverImage(cover);
                setCoverTimeMs(null);
              }}
            />
          </div>
        ) : coverImage ? (
          <div className="rounded-3xl border border-white/8 bg-white/2 p-4 space-y-4">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={t('frames.cover.image_preview')}
                className="mx-auto aspect-9/16 h-[min(40dvh,26rem)] rounded-2xl border border-white/10 object-cover"
              />
            ) : null}
            <p className="text-xs text-white/60">
              {t('frames.cover.image_chosen')}
            </p>
            <button
              type="button"
              onClick={() => setCoverImage(null)}
              className="min-h-11 text-sm font-semibold text-white/80 hover:text-white"
            >
              {t('frames.cover.image_remove')}
            </button>
          </div>
        ) : video ? (
          <div className="rounded-3xl border border-white/8 bg-white/2 p-4 space-y-4">
            <FrameCoverPicker
              src={video.url}
              startSec={video.videoData?.startTime}
              endSec={video.videoData?.endTime}
              valueMs={coverTimeMs}
              onChange={setCoverTimeMs}
            />
            <p className="text-xs text-white/60">{t('frames.cover.help')}</p>
            {coverTimeMs !== null && (
              <button
                type="button"
                onClick={() => setCoverTimeMs(null)}
                className="min-h-11 text-sm font-semibold text-white/80 hover:text-white"
              >
                {t('frames.cover.use_automatic')}
              </button>
            )}
          </div>
        ) : null}
        {!picked ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className={`${CREATE_SECONDARY} mt-4 w-full`}
          >
            <ImagePlus size={18} aria-hidden />
            {t('frames.cover.image_add')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
