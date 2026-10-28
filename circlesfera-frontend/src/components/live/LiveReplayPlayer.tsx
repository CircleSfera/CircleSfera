import { useTranslation } from 'react-i18next';
import type { LiveRecording } from '../../services/liveRecordings';
import HlsVideoPlayer from '../common/HlsVideoPlayer';
import { Dialog } from '../ui/Dialog';

interface LiveReplayPlayerProps {
  recording: LiveRecording | null;
  onClose: () => void;
}

/** The recording of a live, played upright as it was broadcast. */
export default function LiveReplayPlayer({
  recording,
  onClose,
}: LiveReplayPlayerProps) {
  const { t } = useTranslation();
  const replayUrl = recording?.replayUrl;

  return (
    <Dialog
      isOpen={!!replayUrl}
      onClose={onClose}
      title={recording?.title || t('live.recording.untitled')}
      maxWidth="sm"
      noPadding
    >
      {replayUrl && (
        <div className="mx-auto aspect-9/16 max-h-[78dvh] w-full overflow-hidden rounded-b-xl bg-black">
          <HlsVideoPlayer
            src={replayUrl}
            hlsUrl={replayUrl}
            poster={recording?.thumbnailUrl ?? undefined}
            controls
            autoPlay
            playsInline
            aria-label={t('live.recording.player_label')}
            className="h-full w-full object-contain"
          />
        </div>
      )}
    </Dialog>
  );
}
