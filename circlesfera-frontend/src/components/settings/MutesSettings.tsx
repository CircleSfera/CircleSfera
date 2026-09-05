import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { followsApi, type MutedUserEntry } from '../../services';
import type { ProfileWithUser } from '../../types';
import { EmptyState } from '../ErrorEmptyStates';
import MuteDurationModal from '../modals/MuteDurationModal';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';
import SettingsSection from './SettingsSection';

function formatMuteExpiry(
  expiresAt: string | null,
  locale: string,
  foreverLabel: string,
  untilTemplate: (date: string) => string,
): string {
  if (!expiresAt) return foreverLabel;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return foreverLabel;
  return untilTemplate(
    date.toLocaleString(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
  );
}

export default function MutesSettings() {
  const { t, i18n } = useTranslation();
  const [durationUsername, setDurationUsername] = useState<string | null>(null);

  const { data: blockedUsersData, refetch: refetchBlocked } = useQuery({
    queryKey: ['blockedUsers'],
    queryFn: () => followsApi.getBlocked(),
  });
  const blockedUsers = blockedUsersData?.data || [];

  const { data: mutedUsersData, refetch: refetchMuted } = useQuery({
    queryKey: ['mutedUsers'],
    queryFn: () => followsApi.getMuted(),
  });
  const mutedEntries = mutedUsersData?.data || [];

  const unblockMutation = useMutation({
    mutationFn: (targetUsername: string) => followsApi.unblock(targetUsername),
    onSuccess: () => refetchBlocked(),
  });

  const unmuteMutation = useMutation({
    mutationFn: (targetUsername: string) => followsApi.unmute(targetUsername),
    onSuccess: () => refetchMuted(),
  });

  const renderBlockedRow = (user: ProfileWithUser) => (
    <li
      key={user.id}
      className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/2 p-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar
          src={user.avatar || undefined}
          thumbnailUrl={user.thumbnailUrl}
          standardUrl={user.standardUrl}
          alt={user.username || ''}
          size="md"
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {user.username || t('settings.mutes.unknown')}
          </p>
          {user.fullName ? (
            <p className="text-xs text-white/50 truncate">{user.fullName}</p>
          ) : null}
        </div>
      </div>
      <Button
        onClick={() => user.username && unblockMutation.mutate(user.username)}
        variant="outline"
        isLoading={unblockMutation.isPending}
        className="min-h-11 text-sm font-semibold px-4 shrink-0"
      >
        {t('settings.mutes.unblock')}
      </Button>
    </li>
  );

  const renderMutedRow = (entry: MutedUserEntry) => {
    const user = entry.profile;
    return (
      <li
        key={user.id}
        className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/2 p-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar
            src={user.avatar || undefined}
            thumbnailUrl={user.thumbnailUrl}
            standardUrl={user.standardUrl}
            alt={user.username || ''}
            size="md"
            className="w-10 h-10 rounded-full object-cover shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {user.username || t('settings.mutes.unknown')}
            </p>
            <p className="text-xs text-white/50 truncate">
              {formatMuteExpiry(
                entry.expiresAt,
                i18n.language,
                t('settings.mutes.expires_forever', 'Forever'),
                (date) =>
                  t('settings.mutes.expires_on', 'Until {{date}}', { date }),
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Button
            onClick={() => user.username && setDurationUsername(user.username)}
            variant="outline"
            className="min-h-11 text-sm font-semibold px-4"
          >
            {t('settings.mutes.change_duration', 'Duration')}
          </Button>
          <Button
            onClick={() =>
              user.username && unmuteMutation.mutate(user.username)
            }
            variant="outline"
            isLoading={unmuteMutation.isPending}
            className="min-h-11 text-sm font-semibold px-4"
          >
            {t('settings.mutes.unmute', 'Unmute')}
          </Button>
        </div>
      </li>
    );
  };

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
            {blockedUsers.map((user: ProfileWithUser) =>
              renderBlockedRow(user),
            )}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection
        title={t('settings.mutes.muted_title', 'Muted users')}
        card={false}
      >
        {mutedEntries.length === 0 ? (
          <EmptyState
            icon="followers"
            title={t('settings.mutes.muted_empty', 'No muted users')}
          />
        ) : (
          <ul className="space-y-2">{mutedEntries.map(renderMutedRow)}</ul>
        )}
      </SettingsSection>

      {durationUsername && (
        <MuteDurationModal
          isOpen={!!durationUsername}
          username={durationUsername}
          onClose={() => setDurationUsername(null)}
          onMuted={() => {
            void refetchMuted();
            setDurationUsername(null);
          }}
        />
      )}
    </div>
  );
}
