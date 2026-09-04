import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { closeFriendsApi, searchApi } from '../services';
import type { ProfileWithUser } from '../types';
import { useDebouncedValue } from './useDebouncedValue';

export function useCloseFriendsList(enabled = true) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  const debouncedSearch = useDebouncedValue(searchTerm.trim(), 400);

  const { data: closeFriends = [], isLoading } = useQuery({
    queryKey: ['closeFriends'],
    queryFn: () => closeFriendsApi.getCloseFriends().then((res) => res.data),
    enabled,
  });

  const closeFriendIds = useMemo(
    () => new Set(closeFriends.map((user) => user.id)),
    [closeFriends],
  );

  const { data: searchResults = [], isFetching: isSearching } = useQuery({
    queryKey: ['closeFriends', 'search', debouncedSearch],
    queryFn: () =>
      searchApi.searchUsers(debouncedSearch).then((res) => res.data),
    enabled: enabled && debouncedSearch.length >= 2,
  });

  const toggleMutation = useMutation({
    mutationFn: (friendId: string) =>
      closeFriendsApi.toggleCloseFriend(friendId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closeFriends'] });
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: () => {
      toast.error(t('settings.close_friends_modal.toggle_error'));
    },
  });

  const displayUsers: ProfileWithUser[] = debouncedSearch
    ? searchResults
    : closeFriends;

  return {
    closeFriends,
    closeFriendsCount: closeFriends.length,
    closeFriendIds,
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    displayUsers,
    isLoading,
    isSearching,
    toggleCloseFriend: toggleMutation.mutate,
    isToggling: toggleMutation.isPending,
  };
}
