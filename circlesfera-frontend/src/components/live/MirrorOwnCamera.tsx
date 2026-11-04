import { useLocalParticipant } from '@livekit/components-react';
import { LocalVideoTrack } from 'livekit-client';
import { useEffect } from 'react';
import { logger } from '../../utils/logger';
import { MirrorCamera } from './mirrorCamera';

/**
 * Puts the mirror on this person's own camera once it is on air, whether
 * they host or joined as a guest. A camera put on air again is a new track
 * and gets it again.
 */
export function MirrorOwnCamera() {
  const { cameraTrack } = useLocalParticipant();
  const track = cameraTrack?.videoTrack;
  useEffect(() => {
    if (!(track instanceof LocalVideoTrack)) return;
    if (track.getProcessor() || !MirrorCamera.supported()) return;
    track.setProcessor(new MirrorCamera()).catch((error: unknown) => {
      // The camera is still sent, as it is.
      logger.error('Could not mirror the camera', error);
    });
  }, [track]);
  return null;
}
