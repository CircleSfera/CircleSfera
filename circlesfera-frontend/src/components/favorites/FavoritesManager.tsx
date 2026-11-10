import { useInfiniteQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFavorites } from '../../hooks/useFavorites';
import { followsApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import type { Profile } from '../../types';
import UserAvatar from '../UserAvatar';

// The Profile's Favorites first, then everyone it follows, each with a heart
// that adds or removes it. Only Profiles it follows can be Favorites, so the
// list to choose from is its own Following.
export default function FavoritesManager() {
  const { t } = useTranslation();
  const username = useAuthStore((state) => state.profile?.username);
  const { favorites, isFavorite, toggle, isPending, isLoading, max } =
    useFavorites();

  const following = useInfiniteQuery({
    queryKey: ['favorites', 'following', username],
    queryFn: ({ pageParam }) =>
      followsApi
        .getFollowing(username as string, pageParam, 30)
        .then((res) => res.data),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!username,
  });
  const others = (
    following.data?.pages.flatMap((page) => page.data) ?? []
  ).filter((profile) => !isFavorite(profile.id));

  const row = (profile: Profile) => (
    <FavoriteRow
      key={profile.id}
      profile={profile}
      chosen={isFavorite(profile.id)}
      disabled={isPending}
      onToggle={() => toggle(profile.id)}
    />
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-white/60 mb-2">
          {t('favorites.count', { count: favorites.length, max })}
        </p>
        {isLoading ? (
          <p className="text-sm text-white/50 py-4">{t('favorites.loading')}</p>
        ) : favorites.length === 0 ? (
          <p className="text-sm text-white/50 py-4">{t('favorites.empty')}</p>
        ) : (
          <ul className="space-y-0.5">{favorites.map(row)}</ul>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-white/60 mb-2">
          {t('favorites.following')}
        </p>
        {following.isLoading ? (
          <p className="text-sm text-white/50 py-4">{t('favorites.loading')}</p>
        ) : (
          <ul className="space-y-0.5">{others.map(row)}</ul>
        )}
        {following.hasNextPage && (
          <button
            type="button"
            onClick={() => following.fetchNextPage()}
            disabled={following.isFetchingNextPage}
            className="mt-2 min-h-11 px-4 rounded-xl text-sm font-semibold text-white/80 bg-white/5 hover:bg-white/10 disabled:opacity-60"
          >
            {t('favorites.load_more')}
          </button>
        )}
      </div>
    </div>
  );
}

function FavoriteRow({
  profile,
  chosen,
  disabled,
  onToggle,
}: {
  profile: Profile;
  chosen: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center justify-between gap-3 p-2 min-h-[64px] rounded-xl hover:bg-white/5">
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar
          src={profile.avatar || undefined}
          thumbnailUrl={profile.thumbnailUrl || undefined}
          standardUrl={profile.standardUrl || undefined}
          alt={profile.username || ''}
          size="md"
          className="w-10 h-10 shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {profile.username}
          </p>
          {profile.fullName ? (
            <p className="text-xs text-white/50 truncate">{profile.fullName}</p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={chosen}
        aria-label={
          chosen
            ? t('favorites.remove_label', { username: profile.username })
            : t('favorites.add_label', { username: profile.username })
        }
        className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center hover:bg-white/10 disabled:opacity-60"
      >
        <Heart
          size={20}
          aria-hidden
          className={
            chosen ? 'text-brand-secondary fill-current' : 'text-white/50'
          }
        />
      </button>
    </li>
  );
}
