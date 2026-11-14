import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FFMPEG_ENCODE_PRESETS,
  type FfmpegEncodePreset,
  isConstrainedDevice,
  STUDIO_EXPORT_FRAME_RATES,
  STUDIO_EXPORT_SHORT_SIDES,
  STUDIO_FREE_FRAME_RATE,
  STUDIO_FREE_SHORT_SIDE,
  type StudioExportFrameRate,
  type StudioExportShortSide,
} from '../../../utils/studioExportHelpers';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';

interface ExportModalProps {
  isOpen: boolean;
  isExporting: boolean;
  exportProgress: number;
  exportedBlob: Blob | null;
  projectDuration?: number;
  // Whether the Profile has Edits Studio Pro, as the server says.
  studioPro?: boolean;
  onClose: () => void;
  onStartExport: (
    preset: FfmpegEncodePreset,
    quality: { shortSide: StudioExportShortSide; fps: StudioExportFrameRate },
  ) => void;
  onCancelExport: () => void;
  onPublish: (scheduledAt: string) => void;
  onDownload: () => void;
}

export default function ExportModal({
  isOpen,
  isExporting,
  exportProgress,
  exportedBlob,
  projectDuration = 0,
  studioPro = false,
  onClose,
  onStartExport,
  onCancelExport,
  onPublish,
  onDownload,
}: ExportModalProps) {
  const { t } = useTranslation();
  // Read on every render, so a window made narrow since the editor opened
  // is seen when the export opens.
  const constrained = isConstrainedDevice();
  const [preset, setPreset] = useState<FfmpegEncodePreset>('ultrafast');
  const [shortSide, setShortSide] = useState<StudioExportShortSide>(
    STUDIO_FREE_SHORT_SIDE,
  );
  const [fps, setFps] = useState<StudioExportFrameRate>(STUDIO_FREE_FRAME_RATE);
  // Larger sizes and 60 fps were measured on a computer only; a phone keeps
  // its lighter export.
  const proChoices = studioPro && !constrained;
  const [scheduledAt, setScheduledAt] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const minSchedule = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  useEffect(() => {
    if (!exportedBlob) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(exportedBlob);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    return () => URL.revokeObjectURL(url);
  }, [exportedBlob]);

  useEffect(() => {
    if (!isOpen) {
      setScheduledAt('');
      setPreset('ultrafast');
      setShortSide(STUDIO_FREE_SHORT_SIDE);
      setFps(STUDIO_FREE_FRAME_RATE);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const title = isExporting
    ? t('studio.export_rendering')
    : exportedBlob
      ? t('studio.export_ready')
      : t('studio.export_options_title');

  const handleStart = () => {
    onStartExport(
      preset,
      proChoices
        ? { shortSide, fps }
        : { shortSide: STUDIO_FREE_SHORT_SIDE, fps: STUDIO_FREE_FRAME_RATE },
    );
  };

  const chip = (selected: boolean) =>
    `inline-flex items-center gap-2 min-h-11 px-3 rounded-xl border cursor-pointer transition-colors ${
      selected
        ? 'border-brand-primary bg-brand-primary/15 text-white'
        : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
    }`;

  return (
    <Dialog
      isOpen
      onClose={isExporting ? () => undefined : onClose}
      title={title}
      maxWidth="sm"
    >
      <div className="p-6 flex flex-col items-center text-center">
        {isExporting ? (
          <>
            <div className="w-64 bg-surface-raised rounded-full h-2 overflow-hidden border border-white/10 shadow-inner">
              <div
                className="h-full bg-brand-primary transition-all duration-300"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
            <p className="mt-4 text-white font-bold">
              {t('studio.export_progress', {
                percent: Math.round(exportProgress),
              })}
            </p>
            <button
              type="button"
              onClick={onCancelExport}
              data-testid="studio-export-cancel"
              className="mt-6 min-h-11 px-4 rounded-xl border border-white/15 text-white/70 hover:text-white hover:bg-white/5 text-sm font-semibold transition-colors"
            >
              {t('studio.export_cancel')}
            </button>
          </>
        ) : exportedBlob ? (
          <>
            {previewUrl ? (
              <video
                src={previewUrl}
                controls
                playsInline
                className="w-full max-h-[40vh] rounded-xl bg-black border border-white/10 mb-4"
                data-testid="studio-export-preview"
              >
                <track kind="captions" />
              </video>
            ) : null}
            <p className="text-white/60 mb-4 text-sm">
              {t('studio.export_success')}
            </p>

            <div className="w-full text-left space-y-2 mb-4">
              <div className="font-medium text-white text-sm">
                {t('createPost.caption.schedule')}
              </div>
              <p className="text-xs text-white/50">
                {t('studio.export_schedule_hint')}
              </p>
              <input
                type="datetime-local"
                min={minSchedule}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                data-testid="studio-export-schedule"
                className="w-full min-h-12 rounded-xl bg-surface-raised border border-white/10 px-3 py-2 text-white text-base outline-none focus:ring-2 focus:ring-brand-primary/40"
              />
              {scheduledAt ? (
                <button
                  type="button"
                  onClick={() => setScheduledAt('')}
                  className="text-sm text-brand-primary-text hover:underline min-h-11"
                >
                  {t('createPost.caption.clear_schedule')}
                </button>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 w-full">
              <Button
                variant="primary"
                onClick={() => onPublish(scheduledAt)}
                className="button-alone button-alone-wide"
                data-testid="studio-export-publish"
              >
                {t('studio.export_publish')}
              </Button>
              <Button
                variant="outline"
                onClick={onDownload}
                className="button-alone button-alone-wide"
              >
                {t('studio.export_download')}
              </Button>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 text-white/40 hover:text-white/80 text-sm font-medium transition-colors min-h-11"
              >
                {t('common.cancel')}
              </button>
            </div>
          </>
        ) : (
          <>
            {constrained ? (
              <p className="text-xs text-white/70 mb-3 text-left w-full">
                {t('studio.export_mobile_hint')}
              </p>
            ) : null}
            {projectDuration > 90 ? (
              <p className="text-xs text-white/45 mb-3 text-left w-full">
                {t('studio.export_long_duration_hint')}
              </p>
            ) : null}
            {studioPro && constrained ? (
              <p
                className="text-xs text-white/70 mb-3 text-left w-full"
                data-testid="studio-export-pro-computer"
              >
                {t('studio.export_pro.on_computer')}
              </p>
            ) : null}
            {proChoices ? (
              <div className="w-full text-left mb-4 flex flex-col gap-3">
                <div>
                  <div className="text-sm font-medium text-white mb-2">
                    {t('studio.export_pro.size')}
                  </div>
                  <div
                    className="flex flex-wrap gap-2"
                    role="radiogroup"
                    aria-label={t('studio.export_pro.size')}
                  >
                    {STUDIO_EXPORT_SHORT_SIDES.map((side) => (
                      <label key={side} className={chip(shortSide === side)}>
                        <input
                          type="radio"
                          name="export-size"
                          value={side}
                          checked={shortSide === side}
                          onChange={() => setShortSide(side)}
                          className="accent-brand-primary"
                        />
                        <span className="text-xs font-semibold">
                          {t(`studio.export_pro.sizes.${side}`)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-white mb-2">
                    {t('studio.export_pro.frame_rate')}
                  </div>
                  <div
                    className="flex flex-wrap gap-2"
                    role="radiogroup"
                    aria-label={t('studio.export_pro.frame_rate')}
                  >
                    {STUDIO_EXPORT_FRAME_RATES.map((rate) => (
                      <label key={rate} className={chip(fps === rate)}>
                        <input
                          type="radio"
                          name="export-fps"
                          value={rate}
                          checked={fps === rate}
                          onChange={() => setFps(rate)}
                          className="accent-brand-primary"
                        />
                        <span className="text-xs font-semibold">
                          {t('studio.export_pro.fps', { rate })}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                {shortSide !== STUDIO_FREE_SHORT_SIDE ? (
                  <p className="text-xs text-white/50">
                    {t('studio.export_pro.frames_note')}
                  </p>
                ) : null}
              </div>
            ) : null}
            {proChoices ? (
              <div className="text-sm font-medium text-white mb-1 text-left w-full">
                {t('studio.export_quality')}
              </div>
            ) : null}
            <p className="text-xs text-white/50 mb-2 text-left w-full">
              {t('studio.export_quality_hint')}
            </p>
            <div
              className="w-full flex flex-col gap-2 mb-6"
              role="radiogroup"
              aria-label={t('studio.export_quality')}
            >
              {FFMPEG_ENCODE_PRESETS.map((p) => (
                <label
                  key={p}
                  className={`flex items-center gap-3 min-h-11 px-3 rounded-xl border cursor-pointer transition-colors ${
                    preset === p
                      ? 'border-brand-primary bg-brand-primary/15 text-white'
                      : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <input
                    type="radio"
                    name="export-preset"
                    value={p}
                    checked={preset === p}
                    onChange={() => setPreset(p)}
                    className="accent-brand-primary"
                  />
                  <span className="text-xs font-semibold">
                    {t(`studio.export_presets.${p}`)}
                  </span>
                </label>
              ))}
            </div>
            <Button
              variant="primary"
              onClick={handleStart}
              className="button-alone"
              data-testid="studio-export-start"
            >
              {t('studio.export_start')}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 text-white/40 hover:text-white/80 text-sm font-medium transition-colors min-h-11"
            >
              {t('common.cancel')}
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
