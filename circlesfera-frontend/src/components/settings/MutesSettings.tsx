import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { followsApi } from '../../services';
import type { Profile } from '../../types';
import { EmptyState } from '../ErrorEmptyStates';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';
import SettingsSection from './SettingsSection';

export default function MutesSettings() {
  const { t } = useTranslation();

  const { data: blockedUsersData, refetch: refetchBlocked } = useQuery({
    queryKey: ['blockedUsers'],
    queryFn: () => followsApi.getBlocked(),
  });
  const blockedUsers = blockedUsersData?.data || [];

  const { data: mutedUsersData, refetch: refetchMuted } = useQuery({
    queryKey: ['mutedUsers'],
    queryFn: () => followsApi.getMuted(),
  });
  const mutedUsers = mutedUsersData?.data || [];

  const unblockMutation = useMutation({
    mutationFn: (targetUsername: string) => followsApi.unblock(targetUsername),
    onSuccess: () => refetchBlocked(),
  });

  const unmuteMutation = useMutation({
    mutationFn: (targetUsername: string) => followsApi.unmute(targetUsername),
    onSuccess: () => refetchMuted(),
  });

  const renderUserRow = (
    user: { id: string; profile?: Profile },
    actionLabel: string,
    onAction: () => void,
    isLoading: boolean,
  ) => (
    <li
      key={user.id}
      className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/2 p-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar
          src={user.profile?.avatar || undefined}
          thumbnailUrl={user.profile?.thumbnailUrl}
          standardUrl={user.profile?.standardUrl}
          alt={user.profile?.username || ''}
          size="md"
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {user.profile?.username || t('settings.mutes.unknown')}
          </p>
          {user.profile?.fullName ? (
            <p className="text-xs text-white/50 truncate">
              {user.profile.fullName}
            </p>
          ) : null}
        </div>
      </div>
      <Button
        onClick={onAction}
        variant="outline"
        isLoading={isLoading}
        className="min-h-11 text-sm font-semibold px-4 shrink-0"
      >
        {actionLabel}
      </Button>
    </li>
  );

  return (
    <div className="max-w-xl space-y-8">
      <SettingsSection
        title={t('settings.mutes.blocked_title', 'Blocked users')}
        card={false}
      >
        {blockedUsers.length === 0 ? (
          <EmptyState
            icon="followers"
            title={t('settings.mutes.blocked_empty', 'No blocked users')}
          />
        ) : (
          <ul className="space-y-2">
            {blockedUsers.map((user: { id: string; profile?: Profile }) =>
              renderUserRow(
                user,
                t('settings.mutes.unblock'),
                () =>
                  user.profile?.username &&
                  unblockMutation.mutate(user.profile.username),
                unblockMutation.isPending,
              ),
            )}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection
        title={t('settings.mutes.muted_title', 'Muted users')}
        card={false}
      >
        {mutedUsers.length === 0 ? (
          <EmptyState
            icon="followers"
            title={t('settings.mutes.muted_empty', 'No muted users')}
          />
        ) : (
          <ul className="space-y-2">
            {mutedUsers.map((user: { id: string; profile?: Profile }) =>
              renderUserRow(
                user,
                t('settings.mutes.unmute', 'Unmute'),
                () =>
                  user.profile?.username &&
                  unmuteMutation.mutate(user.profile.username),
                unmuteMutation.isPending,
              ),
            )}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
