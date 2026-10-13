import { CameraOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Facing = 'user' | 'environment';
// starting: asking for the camera. on: the host sees themself. refused: the
// browser was told no, or has no camera to give.
type PreviewState = 'starting' | 'on' | 'refused';

// The host sees themself before anyone else does. The picture is only shown
// here: nothing is sent anywhere until the broadcast starts, and the camera
// is let go when this goes away so the broadcast can take it.
export function useCameraPreview() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<PreviewState>('starting');
  const [facing, setFacing] = useState<Facing>('user');

  // The preview was stopped on purpose: a camera that answers afterwards is
  // released at once, never kept beside the broadcast's own capture.
  const stoppedRef = useRef(false);

  const release = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    release();
  }, [release]);

  useEffect(() => {
    let gone = false;
    stoppedRef.current = false;
    const devices = navigator.mediaDevices;
    if (!devices?.getUserMedia) {
      setState('refused');
      return;
    }
    setState('starting');
    devices
      .getUserMedia({ video: { facingMode: facing }, audio: false })
      .then((stream) => {
        if (gone || stoppedRef.current) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        release();
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setState('on');
      })
      .catch(() => {
        if (!gone) setState('refused');
      });
    return () => {
      gone = true;
      release();
    };
  }, [facing, release]);

  const turn = useCallback(
    () => setFacing((now) => (now === 'user' ? 'environment' : 'user')),
    [],
  );

  return { videoRef, state, facing, turn, stop };
}

export function LiveCameraPreview({
  videoRef,
  state,
  facing,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: PreviewState;
  facing: Facing;
}) {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 bg-surface-elevated">
      {/* The front camera is shown as a mirror, the way a person expects to
          see themself; what is broadcast is not mirrored. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        data-testid="live-preview"
        className={`h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''} ${state === 'on' ? '' : 'invisible'}`}
      />
      {state !== 'on' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-sm text-white/70">
          {state === 'refused' ? (
            <>
              <CameraOff className="h-8 w-8" aria-hidden />
              <p>{t('live.preview_refused')}</p>
            </>
          ) : (
            <p>{t('live.starting_camera')}</p>
          )}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/50 via-transparent to-black/70" />
    </div>
  );
}
