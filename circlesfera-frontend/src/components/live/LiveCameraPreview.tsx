import { CameraOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CameraFacing,
  CameraState,
} from '../story/capture/useStoryCamera';

// The host sees themself before anyone else does, with the camera of the
// capture screens; nothing is sent until the broadcast starts.
export function LiveCameraPreview({
  videoRef,
  state,
  facing,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: CameraState;
  facing: CameraFacing;
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
          {state === 'refused' || state === 'none' ? (
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
