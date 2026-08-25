import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { followsApi } from '../../services';
import type { Profile } from '../../types';
import { EmptyState } from '../ErrorEmptyStates';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';
import SettingsSection from './SettingsSection';

export default function RequestsSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: pendingRequestsData, refetch } = useQuery({
    queryKey: ['pendingFollowRequests'],
    queryFn: () => followsApi.getPending(),
  });
  const pendingRequests = pendingRequestsData?.data || [];

  const acceptRequestMutation = useMutation({
    mutationFn: (username: string) => followsApi.acceptRequest(username),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: (username: string) => followsApi.rejectRequest(username),
    onSuccess: () => refetch(),
  });

  return (
    <div className="max-w-xl space-y-5">
      <SettingsSection
        title={t('settings.requests.title')}
        description={t('settings.requests.subtitle')}
        card={false}
      >
        {pendingRequests.length === 0 ? (
          <EmptyState icon="followers" title={t('settings.requests.empty')} />
        ) : (
          <ul className="space-y-2">
            {pendingRequests.map((user: { id: string; profile?: Profile }) => (
              <li
                key={user.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3"
              >
                <Link
                  to={`/${user.profile?.username}`}
                  className="flex items-center gap-3 min-w-0"
                >
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
                      {user.profile?.fullName || user.profile?.username}
                    </p>
                    <p className="text-xs text-white/50 truncate">
                      @{user.profile?.username}
                    </p>
                  </div>
                </Link>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    onClick={() =>
                      user.profile?.username &&
                      acceptRequestMutation.mutate(user.profile.username)
                    }
                    isLoading={acceptRequestMutation.isPending}
                    variant="primary"
                    className="flex-1 sm:flex-none min-h-11 text-sm font-semibold px-4"
                  >
                    {t('settings.requests.confirm')}
                  </Button>
                  <Button
                    onClick={() =>
                      user.profile?.username &&
                      rejectRequestMutation.mutate(user.profile.username)
                    }
                    isLoading={rejectRequestMutation.isPending}
                    variant="ghost"
                    className="flex-1 sm:flex-none min-h-11 text-sm font-semibold px-4"
                  >
                    {t('settings.requests.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
