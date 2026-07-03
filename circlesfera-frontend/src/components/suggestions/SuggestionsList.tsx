import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usersApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import type { SuggestedUser } from '../../types';
import { logger } from '../../utils/logger';
import { SuggestedUserCard } from './SuggestedUserCard';

export const SuggestionsList: React.FC<{
  layout?: 'horizontal' | 'vertical';
}> = ({ layout = 'horizontal' }) => {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        const response = await usersApi.getSuggestions();
        setUsers(response.data);
      } catch (error) {
        logger.error('Error fetching suggestions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, [isAuthenticated]);

  const handleFollow = () => {
    // Optionally remove user from list after follow
    // setUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  if (!loading && users.length === 0) return null;

  if (layout === 'vertical') {
    return (
      <div className="py-6 px-4 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl w-full">
        <div className="flex justify-between items-center mb-4 px-1">
          <span className="font-black text-zinc-400 text-xs uppercase tracking-wider">
            {t('suggestions.title')}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {loading
            ? ['s1', 's2', 's3'].map((id) => (
                <div
                  key={id}
                  className="w-full h-12 bg-white/5 rounded-xl animate-pulse"
                />
              ))
            : users
                .slice(0, 5)
                .map((user) => (
                  <SuggestedUserCard
                    key={user.id}
                    user={user}
                    onFollow={handleFollow}
                    layout="row"
                  />
                ))}
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 my-2">
      <div className="flex justify-between items-center px-4 mb-4">
        <span className="font-black text-zinc-500 text-xs uppercase tracking-wide">
          {t('suggestions.title')}
        </span>
        <button
          type="button"
          className="text-xs font-black uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors"
        >
          {t('suggestions.see_all')}
        </button>
      </div>
      <div className="flex space-x-4 overflow-x-auto px-4 pb-4 no-scrollbar scroll-smooth">
        {loading
          ? ['s1', 's2', 's3', 's4', 's5'].map((id) => (
              <div
                key={id}
                className="shrink-0 w-[140px] h-[200px] glass-panel rounded-lg animate-pulse"
              />
            ))
          : users.map((user) => (
              <div key={user.id} className="shrink-0">
                <SuggestedUserCard user={user} onFollow={handleFollow} />
              </div>
            ))}
      </div>
    </div>
  );
};
