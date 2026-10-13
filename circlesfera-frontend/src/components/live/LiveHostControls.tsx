import { useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic, MicOff, SwitchCamera, Video, VideoOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';
import { LiveControl } from './LivePieces';

// What the host does to their own picture and sound: turn the camera
// around, switch it off, switch the microphone off. A thing switched off is
// drawn in white, so the host notices the state they are in.
export default function LiveHostControls() {
  const { t } = useTranslation();
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled } =
    useLocalParticipant();
  const [facing, setFacing] = useState<'user' | 'environment'>('user');

  const turnCamera = async () => {
    const next = facing === 'user' ? 'environment' : 'user';
    const track = localParticipant.getTrackPublication(
      Track.Source.Camera,
    )?.videoTrack;
    if (!track) return;
    try {
      await track.restartTrack({ facingMode: next });
      setFacing(next);
    } catch (error) {
      // A device with one camera has nothing to turn to.
      logger.error('Could not turn the camera', error);
    }
  };

  return (
    <>
      <LiveControl
        label={t('live.turn_camera')}
        onClick={turnCamera}
        disabled={!isCameraEnabled}
      >
        <SwitchCamera className="h-5 w-5" aria-hidden />
      </LiveControl>
      <LiveControl
        label={isCameraEnabled ? t('live.camera_off') : t('live.camera_on')}
        aria-pressed={!isCameraEnabled}
        tone={isCameraEnabled ? 'glass' : 'on'}
        onClick={() => void localParticipant.setCameraEnabled(!isCameraEnabled)}
      >
        {isCameraEnabled ? (
          <Video className="h-5 w-5" aria-hidden />
        ) : (
          <VideoOff className="h-5 w-5" aria-hidden />
        )}
      </LiveControl>
      <LiveControl
        label={isMicrophoneEnabled ? t('live.mic_off') : t('live.mic_on')}
        aria-pressed={!isMicrophoneEnabled}
        tone={isMicrophoneEnabled ? 'glass' : 'on'}
        onClick={() =>
          void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
        }
      >
        {isMicrophoneEnabled ? (
          <Mic className="h-5 w-5" aria-hidden />
        ) : (
          <MicOff className="h-5 w-5" aria-hidden />
        )}
      </LiveControl>
    </>
  );
}
