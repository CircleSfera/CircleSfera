import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FFMPEG_ENCODE_PRESETS,
  type FfmpegEncodePreset,
  isConstrainedDevice,
} from '../../../utils/studioExportHelpers';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';

interface ExportModalProps {
  isOpen: boolean;
  isExporting: boolean;
  exportProgress: number;
  exportedBlob: Blob | null;
  projectDuration?: number;
  onClose: () => void;
  onStartExport: (preset: FfmpegEncodePreset) => void;
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
  onClose,
  onStartExport,
  onCancelExport,
  onPublish,
  onDownload,
}: ExportModalProps) {
  const { t } = useTranslation();
  const constrained = useMemo(() => isConstrainedDevice(), []);
  const [preset, setPreset] = useState<FfmpegEncodePreset>('ultrafast');
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
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const title = isExporting
    ? t('studio.export_rendering')
    : exportedBlob
      ? t('studio.export_ready')
      : t('studio.export_options_title');

  const handleStart = () => {
    if (projectDuration > 90) {
      // Non-blocking: parent may also toast; hint shown inline
    }
    onStartExport(preset);
  };

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
                  className="text-sm text-brand-primary hover:underline min-h-11"
                >
                  {t('createPost.caption.clear_schedule')}
                </button>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 w-full">
              <Button
                variant="primary"
                onClick={() => onPublish(scheduledAt)}
                className="w-full"
                data-testid="studio-export-publish"
              >
                {t('studio.export_publish')}
              </Button>
              <Button variant="outline" onClick={onDownload} className="w-full">
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
            <p className="text-xs text-white/50 mb-2 text-left w-full">
              {t('studio.export_quality_hint')}
            </p>
            {constrained ? (
              <p className="text-[11px] text-brand-accent mb-3 text-left w-full">
                {t('studio.export_mobile_hint')}
              </p>
            ) : null}
            {projectDuration > 90 ? (
              <p className="text-[11px] text-white/45 mb-3 text-left w-full">
                {t('studio.export_long_duration_hint')}
              </p>
            ) : null}
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
              className="w-full"
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
