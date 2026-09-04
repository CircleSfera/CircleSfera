import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, Search, Star } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCloseFriendsList } from '../../hooks/useCloseFriendsList';
import type { ProfileWithUser } from '../../types';
import UserAvatar from '../UserAvatar';

interface CloseFriendsManagerProps {
  enabled?: boolean;
  showHeader?: boolean;
}

export default function CloseFriendsManager({
  enabled = true,
  showHeader = false,
}: CloseFriendsManagerProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    closeFriends,
    closeFriendIds,
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    displayUsers,
    isLoading,
    isSearching,
    toggleCloseFriend,
    isToggling,
  } = useCloseFriendsList(enabled);

  const virtualizer = useVirtualizer({
    count: displayUsers.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 6,
  });

  const showEmpty =
    !isLoading &&
    !isSearching &&
    displayUsers.length === 0 &&
    (debouncedSearch ? debouncedSearch.length >= 2 : closeFriends.length === 0);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {showHeader && (
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="w-9 h-9 rounded-full bg-green-500/20 text-green-500 border border-green-500/30 flex items-center justify-center">
            <Star size={18} className="fill-green-500" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {t('settings.close_friends_modal.title')}
            </h2>
            <p className="text-xs text-white/50">
              {t('settings.close_friends_modal.list_desc')}
            </p>
          </div>
        </div>
      )}

      <div className="relative mb-3 shrink-0">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          size={18}
          aria-hidden
        />
        <input
          type="search"
          placeholder={t('settings.close_friends_modal.search')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full min-h-11 bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 text-sm"
        />
      </div>

      {debouncedSearch.length > 0 && debouncedSearch.length < 2 && (
        <p className="text-xs text-white/45 mb-2 shrink-0">
          {t('settings.close_friends_modal.search_min')}
        </p>
      )}

      <div
        ref={scrollRef}
        className="flex-1 min-h-[200px] max-h-[min(60vh,420px)] overflow-y-auto custom-scrollbar"
      >
        {isLoading ? (
          <p className="text-sm text-white/50 py-8 text-center">
            {t('settings.close_friends_modal.loading')}
          </p>
        ) : isSearching ? (
          <p className="text-sm text-white/50 py-8 text-center">
            {t('settings.close_friends_modal.searching')}
          </p>
        ) : showEmpty ? (
          <div className="py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-white/5 mx-auto mb-3 flex items-center justify-center">
              <Star size={24} className="text-white/40" aria-hidden />
            </div>
            <p className="text-sm font-medium text-white">
              {debouncedSearch
                ? t('settings.close_friends_modal.no_users')
                : t('settings.close_friends_modal.list_title')}
            </p>
            {!debouncedSearch && (
              <p className="text-xs text-white/50 mt-1 px-4">
                {t('settings.close_friends_modal.list_desc')}
              </p>
            )}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const user = displayUsers[virtualRow.index];
              if (!user) return null;
              const isClose = closeFriendIds.has(user.id);

              return (
                <div
                  key={user.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <CloseFriendRow
                    user={user}
                    isClose={isClose}
                    disabled={isToggling}
                    onToggle={() => toggleCloseFriend(user.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CloseFriendRow({
  user,
  isClose,
  disabled,
  onToggle,
}: {
  user: ProfileWithUser;
  isClose: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="flex items-center justify-between p-3 min-h-[72px] hover:bg-white/5 rounded-xl transition w-full text-left disabled:opacity-60"
      onClick={onToggle}
    >
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar
          src={user.avatar || undefined}
          thumbnailUrl={user.thumbnailUrl || undefined}
          standardUrl={user.standardUrl || undefined}
          alt={user.username || ''}
          size="md"
          className="w-10 h-10 shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {user.username}
          </p>
          {user.fullName ? (
            <p className="text-xs text-white/50 truncate">{user.fullName}</p>
          ) : null}
        </div>
      </div>
      <span
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
          isClose ? 'bg-brand-primary border-brand-primary' : 'border-white/30'
        }`}
        aria-hidden
      >
        {isClose && <Check size={12} className="text-white" strokeWidth={3} />}
      </span>
    </button>
  );
}
