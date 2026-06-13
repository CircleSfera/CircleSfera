import { AnimatePresence, motion } from 'framer-motion';
import { Check, Phone, Video, X } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '../../stores/useCallStore';

export const IncomingCallModal: React.FC = () => {
  const { status, remoteUser, callType, acceptCall, declineCall } =
    useCallStore();
  const { t } = useTranslation();

  if (status !== 'incoming' || !remoteUser) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-zinc-900 border border-white/10 rounded-3xl p-8 w-full max-w-sm shadow-2xl flex flex-col items-center text-center"
        >
          {/* Avatar Area */}
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-brand-primary p-1">
              <img
                src={remoteUser.profile.avatar || '/default-avatar.png'}
                alt={remoteUser.profile.username}
                className="w-full h-full object-cover rounded-full"
              />
            </div>
            <div className="absolute -bottom-2 -right-2 bg-brand-primary p-2 rounded-full ring-4 ring-zinc-900 animate-pulse">
              {callType === 'video' ? (
                <Video size={18} fill="white" />
              ) : (
                <Phone size={18} fill="white" />
              )}
            </div>
          </div>

          <h2 className="text-xl font-bold text-white mb-2">
            {remoteUser.profile.fullName || remoteUser.profile.username}
          </h2>
          <p className="text-gray-400 mb-8 animate-pulse text-sm">
            {callType === 'video'
              ? t('chat.incoming_video_call')
              : t('chat.incoming_audio_call')}
          </p>

          <div className="flex gap-6 w-full justify-center">
            {/* Decline Button */}
            <button
              type="button"
              onClick={declineCall}
              className="group flex flex-col items-center gap-2"
            >
              <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-all duration-300">
                <X size={28} />
              </div>
              <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500 group-hover:text-red-400 transition-colors">
                {t('chat.decline')}
              </span>
            </button>

            {/* Accept Button */}
            <button
              type="button"
              onClick={acceptCall}
              className="group flex flex-col items-center gap-2"
            >
              <div className="w-16 h-16 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center group-hover:bg-green-500 group-hover:text-white transition-all duration-300 shadow-lg shadow-green-500/20">
                <Check size={28} />
              </div>
              <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500 group-hover:text-green-400 transition-colors">
                {t('chat.accept')}
              </span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
