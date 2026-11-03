import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BrandAmbientBackground from '../common/BrandAmbientBackground';
import { CREATE_FULL_SCREEN, CREATE_SECONDARY } from './createStyles';
import type { FrameAssemblyStep } from './frameAssembly';

/**
 * While a Frame is put together: its clips being sent, then the server
 * joining them. Cancelling goes back to the clips, as they were.
 */
export default function FrameAssemblyProgress({
  step,
  onCancel,
}: {
  step: FrameAssemblyStep;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`${CREATE_FULL_SCREEN} flex flex-col items-center justify-center gap-4 px-6 text-center text-white`}
      data-testid="frame-assembly-progress"
    >
      <BrandAmbientBackground placement="story" />
      <Loader2 size={32} className="relative animate-spin" aria-hidden />
      <p className="relative text-base font-semibold" role="status">
        {step.kind === 'uploading'
          ? t('frames.assembly.uploading', {
              done: step.done,
              total: step.total,
            })
          : t('frames.assembly.assembling')}
      </p>
      <p className="relative max-w-xs text-sm text-white/70">
        {t('frames.assembly.hint')}
      </p>
      <button
        type="button"
        onClick={onCancel}
        className={`${CREATE_SECONDARY} relative`}
      >
        {t('common.cancel')}
      </button>
    </div>
  );
}
