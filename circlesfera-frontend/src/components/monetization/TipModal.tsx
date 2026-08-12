import { Gift } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../services';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiverId: string;
  postId?: string;
  receiverName: string;
}

const TIP_AMOUNTS = [1, 5, 10, 50];

export default function TipModal({
  isOpen,
  onClose,
  receiverId,
  postId,
  receiverName,
}: TipModalProps) {
  const { t } = useTranslation();
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
      }
    } catch (error: any) {
      if (error?.message) {
        toast.error(error.message);
      } else {
        toast.error(t('wallet.error_send_tip'));
      }
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
          <Gift className="w-7 h-7 text-brand-primary" />
        </div>
        <p className="text-white/60 text-sm">
          {t('wallet.support_with_money', {
            name: receiverName,
            defaultValue: `Support ${receiverName} with a tip`,
          })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {TIP_AMOUNTS.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setSelectedAmount(amount)}
            className={`flex flex-col items-center justify-center min-h-14 py-3 rounded-xl border transition-all ${
              selectedAmount === amount
                ? 'border-brand-primary bg-brand-primary/15 shadow-[0_0_15px_rgba(var(--brand-primary-rgb),0.25)]'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <span
              className={`font-bold text-xl ${selectedAmount === amount ? 'text-brand-primary' : 'text-white'}`}
            >
              ${amount}
            </span>
          </button>
        ))}
      </div>

      <Button
        onClick={handleTip}
        disabled={!selectedAmount}
        isLoading={isSubmitting}
        className="w-full"
        variant="primary"
      >
        {t('wallet.send_tip', 'Send tip')}
      </Button>
    </Dialog>
  );
}
