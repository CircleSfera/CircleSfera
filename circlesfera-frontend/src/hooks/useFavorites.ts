import { FAVORITES_MAX } from '@circlesfera/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { favoritesApi } from '../services';

// The signed-in Profile's Favorites, and adding or removing one. The server
// keeps the rules: only a Profile one follows, at most FAVORITES_MAX.
export function useFavorites(enabled = true) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => favoritesApi.list().then((res) => res.data),
    enabled,
  });

  const favoriteIds = useMemo(
    () => new Set(favorites.map((profile) => profile.id)),
    [favorites],
  );

  const mutation = useMutation({
    mutationFn: ({ profileId, add }: { profileId: string; add: boolean }) =>
      add ? favoritesApi.add(profileId) : favoritesApi.remove(profileId),
    onSuccess: (_data, { add }) => {
      toast.success(add ? t('favorites.added') : t('favorites.removed'));
      void queryClient.invalidateQueries({ queryKey: ['favorites'] });
      void queryClient.invalidateQueries({ queryKey: ['feed', 'favorites'] });
    },
    onError: (err: unknown) => {
      const code = (err as { data?: { errorCode?: string } } | null)?.data
        ?.errorCode;
      toast.error(
        code === 'FAVORITES_FULL'
          ? t('favorites.full', { max: FAVORITES_MAX })
          : code === 'FAVORITE_NOT_FOLLOWED'
            ? t('favorites.not_followed')
            : t('favorites.error'),
      );
    },
  });

  return {
    favorites,
    favoriteIds,
    isLoading,
    max: FAVORITES_MAX,
    isFavorite: (profileId: string) => favoriteIds.has(profileId),
    toggle: (profileId: string) =>
      mutation.mutate({ profileId, add: !favoriteIds.has(profileId) }),
    isPending: mutation.isPending,
  };
}
