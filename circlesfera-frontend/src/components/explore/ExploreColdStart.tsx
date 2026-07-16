import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usersApi } from '../../services/users.service';
import UserAvatar from '../UserAvatar';
import VerificationBadge, {
  type VerificationLevel,
} from '../VerificationBadge';

interface ExploreColdStartProps {
  activeTab: 'foryou' | 'trending';
  setActiveTab: (tab: 'foryou' | 'trending') => void;
}

export default function ExploreColdStart({
  activeTab,
  setActiveTab,
}: ExploreColdStartProps) {
  const { data: suggestedUsers, isLoading } = useQuery({
    queryKey: ['suggestedUsers', 'explore'],
    queryFn: async () => {
      const res = await usersApi.getSuggestions(6);
      return res.data;
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto py-4 px-4 flex flex-col items-center text-center space-y-8"
    >
      {/* Educational Hero */}
      <div className="space-y-4 max-w-xl">
        <div className="w-14 h-14 bg-brand-primary/10 rounded-xl mx-auto flex items-center justify-center border border-brand-primary/20 shadow-xl shadow-brand-primary/20 mb-6 relative">
          <div className="absolute inset-0 bg-brand-primary/20 blur-xl rounded-full" />
          <Sparkles className="text-brand-primary w-6 h-6 relative z-10" />
        </div>

        <h2 className="text-lg md:text-xl font-bold text-white tracking-tight leading-tight">
          {activeTab === 'foryou'
            ? 'Descubre tu propio espacio'
            : 'Las tendencias te esperan'}
        </h2>

        <p className="text-zinc-400 text-sm leading-relaxed font-medium">
          {activeTab === 'foryou'
            ? 'Nuestro motor de Inteligencia Artificial aprende de ti. Dale "Me Gusta" y sigue a otros usuarios para que tu feed cobre vida con contenido personalizado.'
            : 'Parece que no hay tendencias activas en este momento o necesitas explorar más contenido para destapar el flujo.'}
        </p>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center items-center">
          {activeTab === 'foryou' && (
            <button
              type="button"
              onClick={() => setActiveTab('trending')}
              className="px-5 py-2.5 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold transition-all flex items-center gap-2 active:scale-95 border border-white/5"
            >
              <TrendingUp size={16} />
              Ver Tendencias Globales
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              // Open sidebar or navigate to create
              const sidebarToggle =
                document.getElementById('desktop-create-btn');
              if (sidebarToggle) sidebarToggle.click();
            }}
            className="px-5 py-2.5 text-sm bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg font-bold transition-all flex items-center gap-2 shadow-lg shadow-brand-primary/30 active:scale-95"
          >
            <Sparkles size={16} />
            Publicar Ahora
          </button>
        </div>
      </div>

      {/* Suggested Users Section */}
      <div className="w-full pt-8 border-t border-white/10">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Users size={18} className="text-brand-primary" />
            Personas a las que seguir
          </h3>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 glass-panel rounded-lg border border-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : suggestedUsers && suggestedUsers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {suggestedUsers.map((user: any) => (
              <div
                key={user.id}
                className="glass-panel p-4 rounded-lg border border-white/5 hover:bg-white/5 transition-colors flex flex-col items-center text-center group"
              >
                <Link to={`/${user.username}`} className="mb-4 relative">
                  <UserAvatar
                    src={user.avatar || undefined}
                    thumbnailUrl={user.thumbnailUrl}
                    standardUrl={user.standardUrl}
                    alt={user.username}
                    size="lg"
                    verificationLevel={user.verificationLevel}
                  />
                </Link>
                <Link
                  to={`/${user.username}`}
                  className="font-bold text-white mb-1 flex items-center justify-center gap-1 group-hover:text-brand-primary transition-colors"
                >
                  <span className="truncate max-w-[120px]">
                    {user.username}
                  </span>
                  <VerificationBadge
                    level={user.verificationLevel as VerificationLevel}
                    size={14}
                  />
                </Link>
                <p className="text-xs text-zinc-500 truncate w-full mb-4">
                  {user.fullName}
                </p>
                <button
                  type="button"
                  className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wide rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus size={14} />
                  Seguir
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 bg-white/5 rounded-xl border border-dashed border-white/10">
            <p className="text-zinc-500 font-medium">
              No hay sugerencias en este momento.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
