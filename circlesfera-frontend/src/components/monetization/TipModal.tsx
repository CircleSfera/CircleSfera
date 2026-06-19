import { AnimatePresence, motion } from 'framer-motion';
import { Gift, Heart, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../services';
import { Button } from '../ui';

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiverId: string;
  postId?: string;
  receiverName: string;
}

// Amounts in dollars
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
      toast.error(error.response?.data?.message || t('wallet.error_send_tip'));
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="w-full max-w-sm rounded-[32px] overflow-hidden modal-glass"
          >
            <div className="relative pt-8 pb-4 px-6 text-center border-b border-white/5">
              <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-emerald-400 via-brand-primary to-teal-500 opacity-80" />
              <Button
                onClick={onClose}
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 text-gray-400 hover:text-white rounded-full hover:bg-white/5"
              >
                <X size={20} />
              </Button>

              <div className="w-16 h-16 mx-auto bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
                <Gift className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="font-bold text-white text-xl tracking-tight mb-1">
                {t('wallet.send_gift')}
              </h3>
              <p className="text-gray-400 text-sm">
                {t('wallet.support_with_money', {
                  name: receiverName,
                  defaultValue: `Support ${receiverName} with a tip`,
                })}
              </p>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-3 mb-6">
                {TIP_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setSelectedAmount(amount)}
                    className={`flex flex-col items-center justify-center py-4 rounded-lg border transition-all ${
                      selectedAmount === amount
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <span
                      className={`font-bold text-xl ${selectedAmount === amount ? 'text-emerald-500' : 'text-white'}`}
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
                variant="primary"
                className="w-full py-4 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 border-transparent font-bold shadow-lg active:scale-[0.98]"
              >
                <Heart size={18} fill="currentColor" className="mr-2" />
                {t('wallet.send_tip')}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
