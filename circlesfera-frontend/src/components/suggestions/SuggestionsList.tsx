import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usersApi } from '../../services';
import type { SuggestedUser } from '../../types';
import { logger } from '../../utils/logger';
import { SuggestedUserCard } from './SuggestedUserCard';

export const SuggestionsList: React.FC = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  const handleFollow = () => {
    // Optionally remove user from list after follow
    // setUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  if (!loading && users.length === 0) return null;

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
