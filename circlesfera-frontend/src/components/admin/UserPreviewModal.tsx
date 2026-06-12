import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Calendar,
  ExternalLink,
  Mail,
  MessageSquare,
  User,
  X,
} from 'lucide-react';
import { adminApi } from '../../services/admin.service';
import { LoadingSpinner } from '../index';

interface UserPreviewModalProps {
  userId: string;
  onClose: () => void;
}

export default function UserPreviewModal({
  userId,
  onClose,
}: UserPreviewModalProps) {
  const { data: user, isLoading } = useQuery({
    queryKey: ['admin', 'user-detail', userId],
    queryFn: () => adminApi.getUserDetail(userId).then((res) => res.data),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-2xl bg-[#0A0A0A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {isLoading ? (
          <div className="p-20 flex flex-col items-center gap-4">
            <LoadingSpinner size="lg" />
            <p className="text-gray-500 font-bold animate-pulse uppercase tracking-[0.2em] text-[10px]">
              Cargando expediente...
            </p>
          </div>
        ) : user ? (
          <>
            {/* Header / Cover Area */}
            <div className="relative h-32 bg-linear-to-br from-brand-primary/20 to-purple-500/10 border-b border-white/5">
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white/60 hover:text-white hover:bg-black/60 transition-all z-10"
              >
                <X size={20} />
              </button>
            </div>

            {/* Profile Info Section */}
            <div className="px-8 pb-8 -mt-12 relative flex-1 overflow-y-auto">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div className="flex items-end gap-6">
                  <div className="w-32 h-32 rounded-[2.5rem] bg-white/5 border-4 border-[#0A0A0A] overflow-hidden shadow-xl shrink-0 ring-1 ring-white/10">
                    {user.profile?.avatar ? (
                      <img
                        src={user.profile.avatar}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-700">
                        <User size={48} />
                      </div>
                    )}
                  </div>
                  <div className="pb-2">
                    <h2 className="text-3xl font-black text-white tracking-tight leading-none mb-1">
                      {user.profile?.fullName || 'Usuario de CircleSfera'}
                    </h2>
                    <p className="text-brand-primary font-bold text-lg">
                      @{user.profile?.username}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pb-2">
                  <span
                    className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                      user.isActive
                        ? 'bg-green-500/10 text-green-500 border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]'
                        : 'bg-red-500/10 text-red-500 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                    }`}
                  >
                    {user.isActive ? 'Activo' : 'Baneado'}
                  </span>
                  <span className="px-4 py-1.5 rounded-full bg-white/5 text-gray-400 border border-white/10 text-[10px] font-black uppercase tracking-widest">
                    {user.role}
                  </span>
                </div>
              </div>

              {/* Grid Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center gap-4 group hover:border-white/10 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-500 group-hover:text-brand-primary transition-colors">
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      Correo Electrónico
                    </p>
                    <p className="text-sm font-bold text-white">{user.email}</p>
                  </div>
                </div>
                <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center gap-4 group hover:border-white/10 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-500 group-hover:text-brand-primary transition-colors">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      Miembro desde
                    </p>
                    <p className="text-sm font-bold text-white">
                      {new Date(user.createdAt).toLocaleDateString('es-ES', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats & Bio */}
              <div className="space-y-6">
                <div className="flex gap-8 border-b border-white/5 pb-6">
                  <div className="text-center">
                    <p className="text-2xl font-black text-white leading-none mb-1">
                      {user._count.posts}
                    </p>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      Posts
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-white leading-none mb-1">
                      {user._count.followers}
                    </p>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      Seguidores
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-white leading-none mb-1">
                      {user._count.following}
                    </p>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      Siguiendo
                    </p>
                  </div>
                </div>

                {user.profile?.bio && (
                  <div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                      Biografía
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed italic">
                      "{user.profile.bio}"
                    </p>
                  </div>
                )}
              </div>

              {/* Recent Activity Mini-tabs style */}
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <MessageSquare size={14} className="text-brand-primary" />{' '}
                    Posts Recientes
                  </h4>
                  <div className="space-y-2">
                    {user.posts.slice(0, 3).map((post) => (
                      <div
                        key={post.id}
                        className="p-3 bg-white/2 rounded-xl border border-white/5 hover:bg-white/5 transition-all text-xs flex justify-between items-center group"
                      >
                        <span className="text-gray-400 truncate max-w-[150px]">
                          {post.caption || '(Sin pie de foto)'}
                        </span>
                        <a
                          href={`/post/${post.id}`}
                          target="_blank"
                          className="text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity"
                          rel="noreferrer"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    ))}
                    {user.posts.length === 0 && (
                      <p className="text-[10px] text-gray-600 font-bold uppercase py-2">
                        Sin actividad reciente
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <AlertCircle size={14} className="text-red-500" /> Reportes
                    Recibidos
                  </h4>
                  <div className="space-y-2">
                    {user.reports.slice(0, 3).map((report) => (
                      <div
                        key={report.id}
                        className="p-3 bg-red-500/5 rounded-xl border border-red-500/10 text-[10px] flex justify-between items-center"
                      >
                        <span className="text-red-300/80 font-bold uppercase">
                          {report.reason}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                            report.status === 'pending'
                              ? 'bg-yellow-500/20 text-yellow-500'
                              : 'bg-green-500/20 text-green-500'
                          }`}
                        >
                          {report.status}
                        </span>
                      </div>
                    ))}
                    {user.reports.length === 0 && (
                      <p className="text-[10px] text-gray-600 font-bold uppercase py-2">
                        Sin reportes pendientes
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="p-20 text-center text-gray-500">
            No se pudo encontrar el usuario
          </div>
        )}
      </motion.div>
    </div>
  );
}
