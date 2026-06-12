import { AnimatePresence, motion } from 'framer-motion';
import { Coins, Gift, Heart, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { api } from '../../services';

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiverId: string;
  postId?: string;
  receiverName: string;
}

const TIP_AMOUNTS = [10, 50, 100, 500];

export default function TipModal({
  isOpen,
  onClose,
  receiverId,
  postId,
  receiverName,
}: TipModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTip = async () => {
    if (!selectedAmount) return;
    setIsSubmitting(true);
    try {
      await api.post('/wallet/tip', {
        receiverId,
        postId,
        amount: selectedAmount,
      });
      toast.success(`Enviado ${selectedAmount} tokens a ${receiverName}!`);
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al enviar propina');
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="w-full max-w-sm rounded-[32px] overflow-hidden modal-glass"
          >
            <div className="relative pt-8 pb-4 px-6 text-center border-b border-white/5">
              <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-yellow-400 via-brand-primary to-rose-500 opacity-80" />
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
              >
                <X size={20} />
              </button>

              <div className="w-16 h-16 mx-auto bg-yellow-500/10 rounded-full flex items-center justify-center mb-4">
                <Gift className="w-8 h-8 text-yellow-500" />
              </div>
              <h3 className="font-bold text-white text-xl tracking-tight mb-1">
                Enviar Regalo
              </h3>
              <p className="text-gray-400 text-sm">
                Apoya a {receiverName} con tokens
              </p>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-3 mb-6">
                {TIP_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setSelectedAmount(amount)}
                    className={`flex flex-col items-center justify-center py-4 rounded-2xl border transition-all ${
                      selectedAmount === amount
                        ? 'border-yellow-500 bg-yellow-500/10 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <Coins
                      className={`w-6 h-6 mb-2 ${selectedAmount === amount ? 'text-yellow-500' : 'text-gray-400'}`}
                    />
                    <span
                      className={`font-bold ${selectedAmount === amount ? 'text-yellow-500' : 'text-white'}`}
                    >
                      {amount}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleTip}
                disabled={!selectedAmount || isSubmitting}
                className="w-full py-4 bg-linear-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  'Procesando...'
                ) : (
                  <>
                    <Heart size={18} fill="currentColor" /> Enviar Propina
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
