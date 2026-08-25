import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search, Star } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '../../hooks/useDebounce';
import { api, closeFriendsApi } from '../../services';
import type { UserWithProfile } from '../../types';
import { logger } from '../../utils/logger';
import UserAvatar from '../UserAvatar';
import SettingsSection from './SettingsSection';

export default function CloseFriendsSettings() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserWithProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { t } = useTranslation();

  const { data: closeFriendsData, isLoading } = useQuery({
    queryKey: ['closeFriends'],
    queryFn: () => closeFriendsApi.getCloseFriends(),
  });

  const closeFriends = closeFriendsData?.data || [];
  const closeFriendIds = new Set(
    closeFriends.map((u: UserWithProfile) => u.id),
  );

  const searchUsers = async (term: string) => {
    if (!term) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const searchRes = await api.get(`/search/users?q=${term}`);
      setSearchResults(searchRes.data);
    } catch (e) {
      logger.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const debouncedSearch = useDebounce(searchUsers, 500);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    debouncedSearch(val);
  };

  const toggleMutation = useMutation({
    mutationFn: (friendId: string) =>
      closeFriendsApi.toggleCloseFriend(friendId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closeFriends'] });
    },
  });

  return (
    <div className="max-w-xl space-y-4">
      <SettingsSection
        title={t('settings.close_friends_modal.title', 'Close friends')}
        description={t(
          'settings.close_friends_modal.list_desc',
          'People in this list can see content you share only with close friends.',
        )}
        card={false}
      >
        <div className="relative mb-4">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            size={18}
            aria-hidden
          />
          <input
            type="search"
            placeholder={t('settings.close_friends_modal.search', 'Search…')}
            value={searchTerm}
            onChange={handleSearch}
            className="w-full min-h-11 bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 text-sm"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-white/50 py-8 text-center">
            {t('settings.close_friends_modal.loading')}
          </p>
        ) : (
          <ul className="space-y-1">
            {searchTerm ? (
              isSearching ? (
                <li className="p-4 text-center text-white/40 text-sm">
                  {t('settings.close_friends_modal.searching')}
                </li>
              ) : searchResults.length === 0 ? (
                <li className="p-4 text-center text-white/40 text-sm">
                  {t('settings.close_friends_modal.no_users')}
                </li>
              ) : (
                searchResults.map((user) => (
                  <CloseFriendRow
                    key={user.id}
                    user={user}
                    isClose={closeFriendIds.has(user.id)}
                    onToggle={() => toggleMutation.mutate(user.id)}
                  />
                ))
              )
            ) : (
              <>
                {closeFriends.length === 0 && (
                  <li className="py-10 text-center">
                    <div className="w-14 h-14 rounded-full bg-white/5 mx-auto mb-3 flex items-center justify-center">
                      <Star size={24} className="text-white/40" />
                    </div>
                    <p className="text-sm font-medium text-white">
                      {t('settings.close_friends_modal.list_title')}
                    </p>
                    <p className="text-xs text-white/50 mt-1">
                      {t('settings.close_friends_modal.list_desc')}
                    </p>
                  </li>
                )}
                {closeFriends.map((user: UserWithProfile) => (
                  <CloseFriendRow
                    key={user.id}
                    user={user}
                    isClose
                    onToggle={() => toggleMutation.mutate(user.id)}
                  />
                ))}
              </>
            )}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}

function CloseFriendRow({
  user,
  isClose,
  onToggle,
}: {
  user: UserWithProfile;
  isClose: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="flex items-center justify-between p-3 min-h-11 hover:bg-white/5 rounded-xl transition w-full text-left"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar
            src={user.profile?.avatar || undefined}
            thumbnailUrl={user.profile?.thumbnailUrl || undefined}
            standardUrl={user.profile?.standardUrl || undefined}
            alt={user.profile?.username || ''}
            size="md"
            className="w-10 h-10 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {user.profile?.username}
            </p>
            {user.profile?.fullName ? (
              <p className="text-xs text-white/50 truncate">
                {user.profile.fullName}
              </p>
            ) : null}
          </div>
        </div>
        <span
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
            isClose
              ? 'bg-brand-primary border-brand-primary'
              : 'border-white/30'
          }`}
          aria-hidden
        >
          {isClose && (
            <Check size={12} className="text-white" strokeWidth={3} />
          )}
        </span>
      </button>
    </li>
  );
}
