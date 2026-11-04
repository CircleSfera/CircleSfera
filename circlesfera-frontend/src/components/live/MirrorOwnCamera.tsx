import { useLocalParticipant } from '@livekit/components-react';
import { LocalVideoTrack } from 'livekit-client';
import { useEffect, useState } from 'react';
import { logger } from '../../utils/logger';
import { MirrorCamera } from './mirrorCamera';

function useOnScreen(doc: Document = document): boolean {
  const [visible, setVisible] = useState(doc.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(doc.visibilityState !== 'hidden');
    doc.addEventListener('visibilitychange', update);
    return () => doc.removeEventListener('visibilitychange', update);
  }, [doc]);
  return visible;
}

/**
 * Puts the mirror on this person's own camera once it is on air, whether
 * they host or joined as a guest. A camera put on air again is a new track
 * and gets it again. A page out of sight stops drawing, so while it is the
 * camera is sent as it is, and the mirror comes back with the page.
 */
export function MirrorOwnCamera() {
  const { cameraTrack } = useLocalParticipant();
  const track = cameraTrack?.videoTrack;
  const onScreen = useOnScreen();
  useEffect(() => {
    if (!(track instanceof LocalVideoTrack)) return;
    if (!MirrorCamera.supported()) return;
    const processor = track.getProcessor();
    if (!onScreen) {
      if (processor instanceof MirrorCamera) {
        track.stopProcessor().catch((error: unknown) => {
          logger.error('Could not take the mirror off the camera', error);
        });
      }
      return;
    }
    if (processor) return;
    track.setProcessor(new MirrorCamera()).catch((error: unknown) => {
      // The camera is still sent, as it is.
      logger.error('Could not mirror the camera', error);
    });
  }, [track, onScreen]);
  return null;
}
