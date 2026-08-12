import { AnimatePresence, motion } from 'framer-motion';
import { Eye, Gift, Play, Square, TriangleAlert, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AdminLiveStream } from '../../services/admin.service';
import HlsVideoPlayer from '../common/HlsVideoPlayer';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui/Button';

interface Props {
  stream: AdminLiveStream;
  onClose: () => void;
  onEndStream: (id: string) => void;
}

export default function LiveStreamDetailPanel({
  stream,
  onClose,
  onEndStream,
}: Props) {
  const { t } = useTranslation();
  const isLive = stream.status === 'LIVE';

  const videoUrl = isLive ? stream.hlsUrl : stream.replayUrl;

  const startedAtString = new Date(stream.startedAt).toLocaleString();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed inset-y-0 right-0 w-full max-w-xl bg-[#0F1014] border-l border-white/10 shadow-2xl z-50 flex flex-col"
      >
        <div className="flex justify-between items-center p-2.5 sm:p-3 border-b border-white/5">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">
              {stream.title ||
                t('admin.live.untitled', {
                  user: stream.host?.profile?.username || '—',
                })}
            </h2>
            <div className="flex items-center gap-2">
              {isLive ? (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-xs font-bold tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  LIVE
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-xs font-bold tracking-wider">
                  ENDED
                </span>
              )}
              <span className="text-sm text-white/50">{startedAtString}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/50 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-3">
          {/* Video Player Area */}
          <div className="rounded-2xl overflow-hidden bg-black aspect-video border border-white/10 relative shadow-lg">
            {videoUrl ? (
              <HlsVideoPlayer
                src={videoUrl}
                autoPlay
                controls
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40">
                <Play className="w-12 h-12 mb-3 opacity-20" />
                <p>{t('admin.lives.no_video_source')}</p>
              </div>
            )}

            {/* Overlay stats */}
            {isLive && (
              <div className="absolute top-4 left-4 flex gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md text-white text-sm font-semibold">
                  <Eye className="w-4 h-4 text-red-400" />
                  {stream.viewerCount}
                </div>
              </div>
            )}
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="p-4 rounded-xl border border-white/5 bg-white/2">
              <div className="flex items-center gap-3 text-brand-primary mb-1">
                <Users className="w-5 h-5" />
                <span className="font-semibold">{t('admin.live.viewers')}</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {stream.viewerCount}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-white/5 bg-white/2">
              <div className="flex items-center gap-3 text-yellow-400 mb-1">
                <Gift className="w-5 h-5" />
                <span className="font-semibold">{t('admin.live.gifts')}</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {stream._count?.gifts || 0}
              </p>
            </div>
          </div>

          {/* Hosts Info */}
          <div className="space-y-2.5 sm:space-y-3">
            <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider">
              Participantes
            </h3>

            {/* Host */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2">
              <div className="flex items-center gap-3">
                <UserAvatar
                  src={stream.host?.profile?.avatar || undefined}
                  alt={stream.host?.profile?.username || '?'}
                  size="md"
                />
                <div>
                  <div className="font-semibold text-white">
                    @{stream.host?.profile?.username}
                  </div>
                  <div className="text-xs text-white/50">Host Principal</div>
                </div>
              </div>
            </div>

            {/* Co-Host */}
            {stream.coHost && (
              <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    src={stream.coHost?.profile?.avatar || undefined}
                    alt={stream.coHost?.profile?.username || '?'}
                    size="md"
                  />
                  <div>
                    <div className="font-semibold text-white">
                      @{stream.coHost?.profile?.username}
                    </div>
                    <div className="text-xs text-white/50">
                      Co-Host Invitado
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          {isLive && (
            <div className="pt-6 border-t border-white/5 space-y-3">
              <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">
                Acciones de Moderación
              </h3>

              <Button
                variant="outline"
                className="w-full justify-start gap-3 border-orange-500/20 text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/30"
              >
                <TriangleAlert className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-semibold">Enviar Advertencia</div>
                  <div className="text-xs opacity-70">
                    El usuario recibirá un aviso oficial.
                  </div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => onEndStream(stream.id)}
                className="w-full justify-start gap-3 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
              >
                <Square className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-semibold">
                    Forzar Cierre de Transmisión
                  </div>
                  <div className="text-xs opacity-70">
                    El directo terminará inmediatamente.
                  </div>
                </div>
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
