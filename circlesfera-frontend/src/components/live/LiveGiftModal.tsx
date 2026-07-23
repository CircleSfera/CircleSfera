import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Flame, Gem, Rocket, Sparkles, Star, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { liveApi } from '../../services/live';

export interface VirtualGift {
  id: string;
  name: string;
  price: number;
  icon: React.ElementType;
  color: string;
}

const VIRTUAL_GIFTS: VirtualGift[] = [
  {
    id: 'star',
    name: 'Estrella Sfera',
    price: 1,
    icon: Star,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  {
    id: 'flame',
    name: 'Fuego 🔥',
    price: 5,
    icon: Flame,
    color: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
  },
  {
    id: 'crown',
    name: 'Corona Real',
    price: 10,
    icon: Crown,
    color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  },
  {
    id: 'gem',
    name: 'Diamante',
    price: 25,
    icon: Gem,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  },
  {
    id: 'rocket',
    name: 'Cohete Sfera',
    price: 50,
    icon: Rocket,
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  },
];

interface LiveGiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  streamId: string;
}

export default function LiveGiftModal({
  isOpen,
  onClose,
  streamId,
}: LiveGiftModalProps) {
  const { t } = useTranslation();
  const [selectedGift, setSelectedGift] = useState<VirtualGift>(
    VIRTUAL_GIFTS[0],
  );
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    setIsSending(true);
    try {
      const result = await liveApi.sendGift(
        streamId,
        selectedGift.id,
        window.location.href,
      );
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      toast.error(
        t('live.gift_checkout_missing', 'No se pudo iniciar el pago'),
      );
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t('live.gift_error', 'Error al enviar el regalo');
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden relative"
        >
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">
                  {t('live.send_gift_title', 'Enviar Regalo Virtual')}
                </h3>
                <p className="text-xs text-gray-400">
                  {t('live.send_gift_desc', 'Apoya al creador en tiempo real')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            {VIRTUAL_GIFTS.map((gift) => {
              const Icon = gift.icon;
              const isSelected = selectedGift.id === gift.id;
              return (
                <button
                  key={gift.id}
                  type="button"
                  onClick={() => setSelectedGift(gift)}
                  className={`flex flex-col items-center p-4 rounded-2xl border transition-all text-center ${
                    isSelected
                      ? 'bg-brand-primary/20 border-brand-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.2)] scale-105'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className={`p-3 rounded-2xl mb-2 border ${gift.color}`}>
                    <Icon size={24} />
                  </div>
                  <span className="text-xs font-bold truncate max-w-full">
                    {gift.name}
                  </span>
                  <span className="text-[11px] font-extrabold text-brand-primary mt-1">
                    €{gift.price}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="w-full py-3 bg-brand-primary hover:bg-brand-primary/90 text-white font-bold text-sm uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-brand-primary/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Sparkles size={18} />
            {t('live.confirm_send_gift', 'Enviar Regalo')} (€
            {selectedGift.price})
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
