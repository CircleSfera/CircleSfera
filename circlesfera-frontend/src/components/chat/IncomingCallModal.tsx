import { AnimatePresence, motion } from 'framer-motion';
import { Check, Phone, Video, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '../../stores/useCallStore';

export const IncomingCallModal: React.FC = () => {
  const { status, remoteUser, callType, acceptCall, declineCall } =
    useCallStore();
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (status === 'incoming' && audioRef.current) {
      audioRef.current
        .play()
        .catch((e) => console.error('Audio play blocked:', e));
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [status]);

  if (status !== 'incoming' || !remoteUser) return null;

  return (
    <AnimatePresence>
      <audio ref={audioRef} src="/ringtone.mp3" loop preload="auto">
        <track kind="captions" />
      </audio>
      <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="glass-panel border border-white/10 rounded-[32px] p-8 w-full max-w-sm shadow-2xl shadow-black/80 flex flex-col items-center text-center relative overflow-hidden"
        >
          {/* Subtle background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-brand-primary/10 blur-[60px] -z-10 rounded-full pointer-events-none" />

          {/* Avatar Area */}
          <div className="relative mb-8 mt-4">
            {/* Ripple Effects */}
            <div
              className="absolute inset-0 bg-brand-primary/30 rounded-full animate-ping"
              style={{ animationDuration: '2s' }}
            />
            <div
              className="absolute inset-[-15px] bg-brand-primary/10 rounded-full animate-ping"
              style={{ animationDuration: '2.5s', animationDelay: '0.5s' }}
            />

            <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-brand-primary p-1 relative z-10 bg-black shadow-[0_0_30px_rgba(var(--brand-primary),0.5)]">
              <img
                src={remoteUser.profile.avatar || '/default-avatar.png'}
                alt={remoteUser.profile.username}
                className="w-full h-full object-cover rounded-full"
              />
            </div>
            <div className="absolute -bottom-2 -right-2 bg-brand-primary p-2.5 rounded-full ring-4 ring-zinc-900 shadow-xl animate-bounce z-20">
              {callType === 'video' ? (
                <Video size={20} fill="white" />
              ) : (
                <Phone size={20} fill="white" />
              )}
            </div>
          </div>

          <h2 className="text-xl font-bold text-white mb-2">
            {remoteUser.profile.fullName || remoteUser.profile.username}
          </h2>
          <p className="text-white/60 mb-10 animate-pulse text-[13px] uppercase tracking-widest font-bold">
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
              <div className="w-16 h-16 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center group-hover:bg-green-500 group-hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
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
