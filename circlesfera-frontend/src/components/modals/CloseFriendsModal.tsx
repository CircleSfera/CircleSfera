import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search, Star, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDebounce } from '../../hooks/useDebounce';
import { api, closeFriendsApi } from '../../services';
import type { UserWithProfile } from '../../types';
import { logger } from '../../utils/logger';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';

export default function CloseFriendsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserWithProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { t } = useTranslation();

  // Fetch current close friends
  const { data: closeFriendsData, isLoading } = useQuery({
    queryKey: ['closeFriends'],
    queryFn: () => closeFriendsApi.getCloseFriends(),
  });

  const closeFriends = closeFriendsData?.data || [];
  const closeFriendIds = new Set(
    closeFriends.map((u: UserWithProfile) => u.id),
  );

  // Search users (debounced)
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

  // Toggle mutation
  const toggleMutation = useMutation({
    mutationFn: (friendId: string) =>
      closeFriendsApi.toggleCloseFriend(friendId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closeFriends'] });
    },
  });

  const handleToggle = (user: UserWithProfile) => {
    toggleMutation.mutate(user.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-zinc-950/95 backdrop-blur-3xl w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] border border-white/10">
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-500/20 text-green-500 border border-green-500/30 flex items-center justify-center">
              <Star size={18} className="fill-green-500" />
            </div>
            {t('settings.close_friends_modal.title', 'Mejores Amigos')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-white/10 bg-white/5">
          <div className="relative">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder={t(
                'settings.close_friends_modal.search',
                'Buscar...',
              )}
              value={searchTerm}
              onChange={handleSearch}
              className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-[350px] flex flex-col">
          {isLoading ? (
            <div className="p-6 text-center text-gray-300 m-auto">
              {t('settings.close_friends_modal.loading')}
            </div>
          ) : (
            <div className="space-y-1 flex-1 flex flex-col">
              {/* If searching, show search results. Else show close friends list (or suggested) */}
              {searchTerm ? (
                isSearching ? (
                  <div className="p-4 text-center text-gray-500">
                    {t('settings.close_friends_modal.searching')}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    {t('settings.close_friends_modal.no_users')}
                  </div>
                ) : (
                  searchResults.map((user) => (
                    <UserItem
                      key={user.id}
                      user={user}
                      isClose={closeFriendIds.has(user.id)}
                      onToggle={() => handleToggle(user)}
                    />
                  ))
                )
              ) : (
                <>
                  {closeFriends.length === 0 && (
                    <div className="p-8 text-center m-auto flex flex-col items-center justify-center h-full">
                      <div className="w-16 h-16 rounded-full bg-white/5 mx-auto mb-4 flex items-center justify-center">
                        <Star size={32} className="text-gray-500" />
                      </div>
                      <h3 className="text-white font-medium mb-1">
                        {t('settings.close_friends_modal.list_title')}
                      </h3>
                      <p className="text-gray-300 text-sm">
                        {t('settings.close_friends_modal.list_desc')}
                      </p>
                    </div>
                  )}

                  {/* List of close friends */}
                  {closeFriends.map((user: UserWithProfile) => (
                    <UserItem
                      key={user.id}
                      user={user}
                      isClose={true}
                      onToggle={() => handleToggle(user)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-white/10 bg-zinc-950/50">
          <Button
            onClick={onClose}
            variant="primary"
            className="w-full font-bold uppercase tracking-wider"
          >
            {t('settings.close_friends_modal.done', 'Hecho')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function UserItem({
  user,
  isClose,
  onToggle,
}: {
  user: UserWithProfile;
  isClose: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center justify-between p-3 hover:bg-white/5 rounded-lg transition group cursor-pointer w-full text-left appearance-none bg-transparent border-none"
      onClick={onToggle}
    >
      <div className="flex items-center gap-3">
        <UserAvatar
          src={user.profile?.avatar || undefined}
          thumbnailUrl={user.profile?.thumbnailUrl || undefined}
          standardUrl={user.profile?.standardUrl || undefined}
          alt={user.profile?.username}
          className="w-12 h-12"
        />
        <div>
          <div className="font-semibold text-white">
            {user.profile?.username}
          </div>
          <div className="text-sm text-gray-300">{user.profile?.fullName}</div>
        </div>
      </div>
      <div
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isClose ? 'bg-green-500 border-green-500' : 'border-gray-500 group-hover:border-white'}`}
      >
        {isClose && <Check size={14} className="text-black stroke-3" />}
      </div>
    </button>
  );
}
