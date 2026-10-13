import { Crown, Flame, Gem, Rocket, Sparkles, Star } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { liveApi } from '../../services/live';
import { reportPaymentError } from '../../utils/identityVerification';
import { formatWholeEuros } from '../../utils/money';
import { CREATE_PRIMARY } from '../create-post/createStyles';
import { LiveSheet } from './LivePieces';

export interface VirtualGift {
  id: string;
  nameKey: string;
  price: number;
  icon: React.ElementType;
  color: string;
}

export const VIRTUAL_GIFTS: VirtualGift[] = [
  {
    id: 'star',
    nameKey: 'live.gifts.star',
    price: 2,
    icon: Star,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  {
    id: 'flame',
    nameKey: 'live.gifts.flame',
    price: 5,
    icon: Flame,
    color: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
  },
  {
    id: 'crown',
    nameKey: 'live.gifts.crown',
    price: 10,
    icon: Crown,
    color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  },
  {
    id: 'gem',
    nameKey: 'live.gifts.gem',
    price: 25,
    icon: Gem,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  },
  {
    id: 'rocket',
    nameKey: 'live.gifts.rocket',
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
  const { t, i18n } = useTranslation();
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
      toast.error(t('live.gift_checkout_missing'));
    } catch (err: unknown) {
      // The server text is in one language and can be technical.
      reportPaymentError(err, t, 'live.gift_error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <LiveSheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('live.send_gift_title')}
      icon={<Sparkles size={20} className="shrink-0" aria-hidden />}
      footer={
        <button
          type="button"
          onClick={handleSend}
          disabled={isSending}
          className={`w-full ${CREATE_PRIMARY}`}
        >
          {t('live.confirm_send_gift')} (
          {formatWholeEuros(selectedGift.price, i18n.language)})
        </button>
      }
    >
      <p className="mb-3 text-sm text-white/70">{t('live.send_gift_desc')}</p>
      <div className="grid grid-cols-3 gap-2">
        {VIRTUAL_GIFTS.map((gift) => {
          const Icon = gift.icon;
          const isSelected = selectedGift.id === gift.id;
          return (
            <button
              key={gift.id}
              type="button"
              onClick={() => setSelectedGift(gift)}
              aria-pressed={isSelected}
              className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 text-center transition-colors ${
                isSelected
                  ? 'border-white/60 bg-white/15 text-white'
                  : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              <Icon
                size={26}
                className={gift.color.split(' ')[0]}
                aria-hidden
              />
              <span className="line-clamp-2 max-w-full text-xs font-semibold leading-tight">
                {t(gift.nameKey)}
              </span>
              <span className="text-xs font-semibold tabular-nums text-white">
                {formatWholeEuros(gift.price, i18n.language)}
              </span>
            </button>
          );
        })}
      </div>
    </LiveSheet>
  );
}
