import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../../services';
import { logger } from '../../utils/logger';
import { Button, Textarea } from '../ui';
import { Dialog } from '../ui/Dialog';

export type ReportTargetType =
  | 'USER'
  | 'POST'
  | 'COMMENT'
  | 'STORY'
  | 'MESSAGE';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
}

export const REPORT_REASONS = [
  { id: 'SPAM', labelKey: 'report.reasons.spam' },
  { id: 'HARASSMENT', labelKey: 'report.reasons.harassment' },
  { id: 'HATE_SPEECH', labelKey: 'report.reasons.hate_speech' },
  { id: 'VIOLENCE', labelKey: 'report.reasons.violence' },
  { id: 'ILLEGAL_CONTENT', labelKey: 'report.reasons.illegal_content' },
  { id: 'IMPERSONATION', labelKey: 'report.reasons.impersonation' },
  { id: 'SCAM', labelKey: 'report.reasons.scam' },
  { id: 'CSAM', labelKey: 'report.reasons.csam' },
  { id: 'OTHER', labelKey: 'report.reasons.other' },
];

export default function ReportModal({
  isOpen,
  onClose,
  targetType,
  targetId,
}: ReportModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setReason('');
      setDetails('');
      setIsSuccess(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!reason) return;
    setIsSubmitting(true);
    try {
      await reportsApi.create({
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
      });
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setReason('');
        setDetails('');
        onClose();
      }, 2000);
    } catch (error) {
      logger.error('Failed to submit report', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('report.title')}
      maxWidth="md"
      className="max-h-[90vh]"
    >
      {isSuccess ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="text-emerald-400" size={40} />
          <p className="text-white font-semibold">{t('report.success')}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3 text-brand-secondary">
            <AlertCircle size={18} aria-hidden />
            <p className="text-white/50 text-sm">
              {t('report.why_report', {
                targetType: t(`report.targets.${targetType.toLowerCase()}`),
              })}
            </p>
          </div>
          <div className="space-y-2 mb-4">
            {REPORT_REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setReason(r.id)}
                className={`w-full text-left px-4 py-3 min-h-11 rounded-xl border transition ${
                  reason === r.id
                    ? 'border-brand-primary bg-brand-primary/20 text-white'
                    : 'border-white/10 text-white/80 hover:bg-white/5'
                }`}
              >
                {t(r.labelKey)}
              </button>
            ))}
          </div>
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={t('report.placeholder')}
            className="mb-4"
          />
          <Button
            onClick={handleSubmit}
            disabled={!reason || isSubmitting}
            isLoading={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? t('report.submitting') : t('report.submit')}
          </Button>
        </>
      )}
    </Dialog>
  );
}
