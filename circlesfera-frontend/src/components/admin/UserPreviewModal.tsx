import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Calendar,
  Database,
  ExternalLink,
  Fingerprint,
  Mail,
  MessageSquare,
  ShieldCheck,
  User,
} from 'lucide-react';
import { adminApi } from '../../services/admin.service';
import { LoadingSpinner } from '../index';
import { AdminDrawer } from './index';

interface UserPreviewModalProps {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Admin user detail drawer (file name kept for import stability).
 * Renders via AdminDrawer — not a centered modal.
 */
export default function UserPreviewModal({
  userId,
  isOpen,
  onClose,
}: UserPreviewModalProps) {
  const { data: user, isLoading } = useQuery({
    queryKey: ['admin', 'user-detail', userId],
    queryFn: () =>
      userId ? adminApi.getUserDetail(userId).then((res) => res.data) : null,
    enabled: !!userId,
  });

  return (
    <AdminDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Expediente de Usuario"
      subtitle={user?.profile?.username ? `@${user.profile.username}` : ''}
      width="lg"
    >
      {isLoading ? (
        <div className="p-20 flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" />
          <p className="text-gray-500 font-semibold animate-pulse uppercase tracking-wide text-xs">
            Cargando expediente...
          </p>
        </div>
      ) : user ? (
        <div className="space-y-4 pb-8">
          {/* Profile Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 glass-panel rounded-xl border border-white/5">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-xl bg-white/5 overflow-hidden shrink-0 ring-1 ring-white/10">
                {user.profile?.avatar ? (
                  <img
                    src={user.profile.avatar}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-700">
                    <User size={32} />
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight leading-none mb-1">
                  {user.profile?.fullName || 'Usuario'}
                </h2>
                <p className="text-brand-primary font-semibold">
                  @{user.profile?.username}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0">
              <span
                className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide border text-center transition-all ${
                  user.isActive
                    ? 'bg-green-500/10 text-green-500 border-green-500/20'
                    : 'bg-red-500/10 text-red-500 border-red-500/20'
                }`}
              >
                {user.isActive ? 'Cuenta Activa' : 'Cuenta Baneada'}
              </span>
              <span className="px-4 py-1.5 rounded-full bg-white/5 text-gray-300 border border-white/10 text-xs font-semibold uppercase tracking-wide text-center">
                Rol: {user.role}
              </span>
            </div>
          </div>

          {/* Grid Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-panel p-4 rounded-lg border border-white/5 flex items-center gap-4 group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-500">
                <Mail size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Correo Electrónico
                </p>
                <p className="text-sm font-semibold text-white truncate">
                  {user.email}
                </p>
              </div>
            </div>
            <div className="glass-panel p-4 rounded-lg border border-white/5 flex items-center gap-4 group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-500">
                <Calendar size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Miembro desde
                </p>
                <p className="text-sm font-semibold text-white">
                  {new Date(user.createdAt).toLocaleDateString('es-ES', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Stats & Bio */}
          <div className="space-y-4">
            <div className="flex gap-8 border-b border-white/5 pb-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-white leading-none mb-1">
                  {user._count.posts}
                </p>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Posts
                </p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white leading-none mb-1">
                  {user._count.followers}
                </p>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Seguidores
                </p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white leading-none mb-1">
                  {user._count.following}
                </p>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Siguiendo
                </p>
              </div>
            </div>

            {user.profile?.bio && (
              <div className="bg-white/2 p-4 rounded-xl border border-white/5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Biografía
                </p>
                <p className="text-sm text-gray-300 leading-relaxed italic">
                  "{user.profile.bio}"
                </p>
              </div>
            )}

            {/* System Details / Identifiers */}
            <div className="bg-white/2 p-5 rounded-xl border border-white/5 space-y-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2 border-b border-white/5 pb-2">
                <Database size={14} className="text-gray-300" /> Datos de
                Sistema y Seguridad
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                    <Fingerprint size={10} /> UUID Interno
                  </span>
                  <p className="text-xs font-mono text-gray-300 bg-black/40 px-2 py-1 rounded truncate border border-white/5">
                    {user.id}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                    <ShieldCheck size={10} /> Nivel de Verificación
                  </span>
                  <p className="text-xs font-semibold text-white uppercase tracking-wider">
                    {user.verificationLevel || 'Ninguno'}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase">
                    Tipo de Cuenta
                  </span>
                  <p className="text-xs font-semibold text-white uppercase tracking-wider">
                    {user.accountType || 'Personal'}
                  </p>
                </div>
                {user.identityVerifiedAt && (
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-emerald-500 uppercase">
                      KYC Verificado El
                    </span>
                    <p className="text-xs font-semibold text-white">
                      {new Date(user.identityVerifiedAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {user.stripeIdentitySessionId && (
                  <div className="space-y-1 col-span-1 sm:col-span-2">
                    <span className="text-xs font-semibold text-indigo-400 uppercase">
                      Stripe Session ID
                    </span>
                    <p className="text-xs font-mono text-gray-300 truncate">
                      {user.stripeIdentitySessionId}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Activity Mini-tabs style */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            <div>
              <h4 className="text-xs font-semibold text-white uppercase tracking-wide mb-4 flex items-center gap-2">
                <MessageSquare size={14} className="text-brand-primary" /> Posts
                Recientes
              </h4>
              <div className="space-y-2">
                {user.posts.slice(0, 3).map((post) => (
                  <div
                    key={post.id}
                    className="p-3 bg-white/2 rounded-xl border border-white/5 hover:bg-white/5 transition-all text-xs flex justify-between items-center group"
                  >
                    <span className="text-gray-300 truncate max-w-[150px]">
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
                  <p className="text-xs text-gray-600 font-semibold uppercase py-2">
                    Sin actividad reciente
                  </p>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-white uppercase tracking-wide mb-4 flex items-center gap-2">
                <AlertCircle size={14} className="text-red-500" /> Reportes
              </h4>
              <div className="space-y-2">
                {user.reports.slice(0, 3).map((report) => (
                  <div
                    key={report.id}
                    className="p-3 bg-red-500/5 rounded-xl border border-red-500/10 text-xs flex justify-between items-center"
                  >
                    <span className="text-red-300/80 font-semibold uppercase truncate max-w-[120px]">
                      {report.reason}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold uppercase shrink-0 ${
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
                  <p className="text-xs text-gray-600 font-semibold uppercase py-2">
                    Sin reportes pendientes
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-20 text-center text-gray-500">
          No se pudo encontrar el expediente del usuario
        </div>
      )}
    </AdminDrawer>
  );
}
