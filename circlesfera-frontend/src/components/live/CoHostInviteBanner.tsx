import { AnimatePresence, motion } from 'framer-motion';
import { Radio, UserPlus, X } from 'lucide-react';
import { liveApi } from '../../services/live';

interface CoHostInvite {
  streamId: string;
  streamTitle?: string | null;
  host: {
    id?: string;
    username?: string;
    avatar?: string | null;
  };
}

interface CoHostInviteBannerProps {
  invite: CoHostInvite | null;
  onAccepted: (token: string, streamId: string) => void;
  onDismiss: () => void;
}

export default function CoHostInviteBanner({
  invite,
  onAccepted,
  onDismiss,
}: CoHostInviteBannerProps) {
  const handleAccept = async () => {
    if (!invite) return;
    try {
      const res = await liveApi.acceptCoHostInvite(invite.streamId);
      onAccepted(res.token, res.streamId);
    } catch (err) {
      console.error('Failed to accept co-host invite', err);
      onDismiss();
    }
  };

  return (
    <AnimatePresence>
      {invite && (
        <motion.div
          initial={{ opacity: 0, y: -80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -60, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="bg-black/90 backdrop-blur-xl border border-purple-500/40 rounded-2xl p-4 shadow-2xl shadow-purple-500/20">
            <div className="flex items-center gap-2 mb-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-xs font-bold text-red-400 uppercase tracking-widest">
                Invitación en directo
              </span>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="relative shrink-0">
                {invite.host.avatar ? (
                  <img
                    src={invite.host.avatar}
                    alt={invite.host.username || 'Host'}
                    className="w-12 h-12 rounded-full object-cover border-2 border-purple-500"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                    <span className="text-white font-bold text-lg">
                      {(invite.host.username?.[0] || '?').toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-0.5">
                  <Radio size={10} className="text-white" />
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm leading-tight">
                  <span className="text-purple-300">
                    @{invite.host.username || 'usuario'}
                  </span>{' '}
                  te invita como co-anfitrión
                </p>
                {invite.streamTitle && (
                  <p className="text-white/50 text-xs mt-0.5 truncate">
                    "{invite.streamTitle}"
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={onDismiss}
                className="shrink-0 p-1.5 text-white/40 hover:text-white/80 transition-colors rounded-full hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAccept}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/20 active:scale-95"
              >
                <UserPlus size={16} />
                Unirme como co-host
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="py-2.5 px-4 bg-white/10 hover:bg-white/15 text-white/70 text-sm font-medium rounded-xl transition-all active:scale-95"
              >
                Rechazar
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
