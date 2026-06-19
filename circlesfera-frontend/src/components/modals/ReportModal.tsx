import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../../services';
import { logger } from '../../utils/logger';
import { Button, Textarea } from '../ui';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'USER' | 'POST';
  targetId: string;
}

const REPORT_REASONS = [
  { id: 'SPAM', label: "It's spam" },
  { id: 'HARASSMENT', label: 'Harassment or bullying' },
  { id: 'INAPPROPRIATE', label: 'Inappropriate content' },
  { id: 'OTHER', label: 'Something else' },
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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="modal-glass w-full max-w-sm rounded-[32px] overflow-hidden"
            onPointerDown={(e) => e.stopPropagation()}
            role="none"
          >
            {/* Header with brand-vibrant accent line */}
            <div className="relative pt-8 pb-1 px-6 text-center">
              <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-brand-primary via-brand-secondary to-brand-accent opacity-80" />

              <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <AlertCircle size={20} className="text-red-500" />
                  <h3 className="font-bold text-white tracking-tight">
                    {t('report.title')}
                  </h3>
                </div>
                <Button
                  onClick={onClose}
                  variant="ghost"
                  size="icon"
                  className="text-gray-500 hover:text-white rounded-full hover:bg-white/5"
                >
                  <X size={20} />
                </Button>
              </div>
            </div>

            {/* Rest of the component content */}
            {isSuccess ? (
              <div className="p-8 text-center space-y-4">
                <div className="flex justify-center">
                  <CheckCircle2
                    size={48}
                    className="text-green-500 animate-bounce"
                  />
                </div>
                <p className="text-white font-medium">{t('report.success')}</p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <p className="text-gray-400 text-sm">
                  {t('report.why_report', {
                    targetType: targetType.toLowerCase(),
                  })}
                </p>

                <div className="space-y-2">
                  {REPORT_REASONS.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => setReason(r.id)}
                      className={`w-full text-left p-3 rounded-lg transition-all border ${
                        reason === r.id
                          ? 'bg-red-500/10 border-red-500 text-white'
                          : 'bg-white/5 border-transparent text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {t(`report.reasons.${r.id.toLowerCase()}`)}
                    </button>
                  ))}
                </div>

                {reason && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <label
                      htmlFor="report-details"
                      className="text-xs text-gray-500 uppercase font-bold px-1"
                    >
                      {t('report.additional_details')}
                    </label>
                    <Textarea
                      id="report-details"
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      placeholder={t('report.placeholder')}
                      className="min-h-[100px] resize-none"
                    />
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  disabled={!reason}
                  isLoading={isSubmitting}
                  variant="danger"
                  className="w-full font-bold py-3 text-base"
                >
                  {t('report.submit')}
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
