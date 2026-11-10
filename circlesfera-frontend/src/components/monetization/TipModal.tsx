import {
  TIP_AMOUNTS_CENTS,
  WEEKLY_SUPPORT_LIMIT_CENTS,
} from '@circlesfera/shared';
import { Gift } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../services';
import { reportPaymentError } from '../../utils/identityVerification';
import { formatCents, formatWholeEuros } from '../../utils/money';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiverId: string;
  // A tip is always for a post (a Frame is one too).
  postId: string;
  receiverName: string;
}

// The fixed amounts a tip can be, in euros.
export const TIP_AMOUNTS = TIP_AMOUNTS_CENTS.map((cents) => cents / 100);

export default function TipModal({
  isOpen,
  onClose,
  receiverId,
  postId,
  receiverName,
}: TipModalProps) {
  const { t, i18n } = useTranslation();
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedAmount(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleTip = async () => {
    if (!selectedAmount) return;
    setIsSubmitting(true);
    try {
      const response = await api.post('/monetization/tip', {
        receiverId,
        postId,
        amountCents: selectedAmount * 100,
        returnUrl: window.location.href,
      });
      if (response.data?.url) {
        window.location.href = response.data.url;
        return;
      }
      // No checkout to open: say so and let the person try again.
      toast.error(t('wallet.error_send_tip'));
      setIsSubmitting(false);
    } catch (error: unknown) {
      // The server text is in one language and can be technical.
      reportPaymentError(error, t, 'wallet.error_send_tip');
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('wallet.send_gift')}
      maxWidth="sm"
    >
      <div className="text-center mb-4">
        <div className="w-14 h-14 mx-auto bg-brand-primary/10 rounded-full flex items-center justify-center mb-3 border border-brand-primary/20">
          <Gift className="w-7 h-7 text-brand-primary-text" />
        </div>
        <p className="text-white/60 text-sm">
          {t('wallet.support_with_money', { name: receiverName })}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {TIP_AMOUNTS.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setSelectedAmount(amount)}
            aria-pressed={selectedAmount === amount}
            className={`min-h-12 px-5 rounded-full border transition-all ${
              selectedAmount === amount
                ? 'border-brand-primary bg-brand-primary/15 shadow-[0_0_15px_rgba(var(--brand-primary-rgb),0.25)]'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <span
              className={`font-bold text-base ${selectedAmount === amount ? 'text-brand-primary-text' : 'text-white'}`}
            >
              {formatWholeEuros(amount, i18n.language)}
            </span>
          </button>
        ))}
      </div>
      {/* The amount is what is paid: the VAT is inside it. */}
      <p className="text-center text-xs text-white/50">{t('vat.included')}</p>
      <p className="mb-4 mt-1 text-center text-xs text-white/50">
        {t('wallet.weekly_limit', {
          limit: formatCents(WEEKLY_SUPPORT_LIMIT_CENTS, i18n.language),
        })}
      </p>

      <Button
        onClick={handleTip}
        disabled={!selectedAmount}
        isLoading={isSubmitting}
        className="button-alone"
        variant="primary"
      >
        {t('wallet.send_tip')}
      </Button>
    </Dialog>
  );
}
