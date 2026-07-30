import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../../services';
import { logger } from '../../utils/logger';
import { Button, Textarea } from '../ui';

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

const REPORT_REASONS = [
  { id: 'SPAM', labelKey: 'report.reason.spam', fallback: "It's spam" },
  {
    id: 'HARASSMENT',
    labelKey: 'report.reason.harassment',
    fallback: 'Harassment or bullying',
  },
  {
    id: 'HATE_SPEECH',
    labelKey: 'report.reason.hate',
    fallback: 'Hate speech',
  },
  {
    id: 'VIOLENCE',
    labelKey: 'report.reason.violence',
    fallback: 'Violence or dangerous content',
  },
  {
    id: 'ILLEGAL_CONTENT',
    labelKey: 'report.reason.illegal',
    fallback: 'Illegal content',
  },
  {
    id: 'IMPERSONATION',
    labelKey: 'report.reason.impersonation',
    fallback: 'Impersonation',
  },
  {
    id: 'SCAM',
    labelKey: 'report.reason.scam',
    fallback: 'Scam or fraud',
  },
  {
    id: 'CSAM',
    labelKey: 'report.reason.csam',
    fallback: 'Child sexual exploitation (CSAM)',
  },
  { id: 'OTHER', labelKey: 'report.reason.other', fallback: 'Something else' },
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
  const dragControls = useDragControls();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
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
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <div className="fixed inset-0 z-101 pointer-events-none flex flex-col justify-end md:justify-center md:items-center">
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_e, info) => {
                if (info.offset.y > 100 || info.velocity.y > 500) {
                  onClose();
                }
              }}
              className="pointer-events-auto w-full bg-black/80 backdrop-blur-2xl border border-white/10 rounded-t-4xl md:max-w-md md:rounded-4xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[90vh]"
              onPointerDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-modal-title"
            >
              <div
                className="w-full flex md:hidden justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing touch-none"
                onPointerDown={(e) => dragControls.start(e)}
              >
                <div className="w-10 h-1.5 bg-white/20 rounded-full" />
              </div>

              <div className="relative pt-4 md:pt-8 pb-1 px-6 text-center">
                <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-[#ff5757] to-[#8c52ff] opacity-80" />

                <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={20} className="text-red-500" />
                    <h2
                      id="report-modal-title"
                      className="text-white font-bold text-lg"
                    >
                      {t('report.title', 'Report')}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 rounded-full hover:bg-white/10 text-white/60"
                    aria-label={t('common.close', 'Close')}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="px-6 pb-8 overflow-y-auto flex-1">
                {isSuccess ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <CheckCircle2 className="text-green-400" size={40} />
                    <p className="text-white font-semibold">
                      {t('report.success', 'Thanks for your report')}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-white/50 text-sm mb-4">
                      {t(
                        'report.subtitle',
                        'Why are you reporting this {{type}}?',
                        { type: targetType.toLowerCase() },
                      )}
                    </p>
                    <div className="space-y-2 mb-4">
                      {REPORT_REASONS.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setReason(r.id)}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition ${
                            reason === r.id
                              ? 'border-brand-primary bg-brand-primary/20 text-white'
                              : 'border-white/10 text-white/80 hover:bg-white/5'
                          }`}
                        >
                          {t(r.labelKey, r.fallback)}
                        </button>
                      ))}
                    </div>
                    <Textarea
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      placeholder={t(
                        'report.details_placeholder',
                        'Additional details (optional)',
                      )}
                      className="mb-4"
                    />
                    <Button
                      onClick={handleSubmit}
                      disabled={!reason || isSubmitting}
                      isLoading={isSubmitting}
                      className="w-full"
                    >
                      {t('report.submit', 'Submit report')}
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
