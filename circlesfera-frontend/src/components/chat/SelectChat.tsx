import { motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function SelectChat() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full text-white/50 bg-[#050505] relative overflow-hidden">
      {/* Background Accent Mesh */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[50%] h-[50%] bg-brand-primary/10 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', duration: 0.8, bounce: 0.4 }}
        className="flex flex-col items-center max-w-sm text-center px-6"
      >
        <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6 shadow-2xl border border-white/10 relative">
          <div
            className="absolute inset-0 rounded-full border border-white/20 scale-110 animate-ping opacity-20"
            style={{ animationDuration: '3s' }}
          />
          <MessageCircle
            size={40}
            className="text-brand-primary opacity-80"
            strokeWidth={1.5}
          />
        </div>
        <h2 className="text-2xl font-black mb-3 text-white tracking-tight">
          {t('chat.your_messages')}
        </h2>
        <p className="text-[15px] leading-relaxed opacity-80 font-medium">
          {t('chat.select_chat_desc')}
        </p>
      </motion.div>
    </div>
  );
}
