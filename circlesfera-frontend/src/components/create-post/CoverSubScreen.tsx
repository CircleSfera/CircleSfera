import { useTranslation } from 'react-i18next';
import type { MediaFile } from '../../hooks/useCreatePost';
import FrameCoverPicker from '../frames/FrameCoverPicker';
import { SUBSCREEN_BODY, SUBSCREEN_SHELL } from './ComposerChrome';
import SubScreenHeader from './SubScreenHeader';

interface CoverSubScreenProps {
  mediaFiles: MediaFile[];
  coverTimeMs: number | null;
  setCoverTimeMs: (value: number | null) => void;
  onClose: () => void;
}

/** The cover of a new frame: a moment of the video being published. */
export default function CoverSubScreen({
  mediaFiles,
  coverTimeMs,
  setCoverTimeMs,
  onClose,
}: CoverSubScreenProps) {
  const { t } = useTranslation();
  const video = mediaFiles.find((m) => m.type === 'video');

  return (
    <div className={SUBSCREEN_SHELL}>
      <SubScreenHeader title={t('frames.cover.title')} onClose={onClose} />
      <div className={SUBSCREEN_BODY}>
        {video ? (
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
      </div>
    </div>
  );
}
