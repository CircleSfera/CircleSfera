import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';

interface PaywallOverlayProps {
  price: number;
  onUnlock: () => void;
  isLoading?: boolean;
}

export default function PaywallOverlay({
  price,
  onUnlock,
  isLoading,
}: PaywallOverlayProps) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      animate={{ opacity: 1, backdropFilter: 'blur(16px)' }}
      exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-black/60 overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-brand-primary/20 rounded-full blur-[60px] pointer-events-none" />

      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ delay: 0.1, type: 'spring', damping: 20 }}
        className="relative flex flex-col items-center"
      >
        <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center mb-5 border border-white/10 shadow-2xl relative group">
          <div className="absolute inset-0 rounded-full bg-brand-primary/20 animate-ping opacity-20" />
          <Lock className="w-7 h-7 text-white drop-shadow-md" />
        </div>
        <h3 className="text-xl font-black text-white mb-2 text-center tracking-tight drop-shadow-lg">
          {t('monetization.exclusive_content')}
        </h3>
        <p className="text-zinc-400 text-[13px] text-center mb-8 max-w-[240px] leading-relaxed">
          {t('monetization.premium_description')}
        </p>

        <Button
          onClick={onUnlock}
          isLoading={isLoading}
          variant="primary"
          className="relative group bg-white text-black hover:bg-zinc-200 px-8 py-3.5 rounded-full font-black text-[13px] uppercase tracking-wider shadow-[0_0_40px_rgba(255,255,255,0.15)] overflow-hidden active:scale-95 border-transparent"
        >
          <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/40 to-transparent -translate-x-[150%] group-hover:animate-[shimmer_1.5s_infinite]" />
          <span className="relative z-10 flex items-center gap-2">
            {t('monetization.unlock_for_money', { price: price.toFixed(2) })}
          </span>
        </Button>
      </motion.div>
    </motion.div>
  );
}
