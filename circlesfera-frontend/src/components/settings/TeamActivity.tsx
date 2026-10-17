import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { type TeamActivityEntry, teamApi } from '../../services/team.service';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';
import SettingsSection from './SettingsSection';

// What was done on the Business Profile and by whom, newest first, for its
// owner.
export default function TeamActivity() {
  const { t, i18n } = useTranslation();
  const activity = useInfiniteQuery({
    queryKey: ['teamActivity'],
    queryFn: ({ pageParam }) => teamApi.activity(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    retry: false,
  });

  const entries = activity.data?.pages.flatMap((p) => p.data) ?? [];

  const who = (entry: TeamActivityEntry) =>
    entry.byOwner
      ? t('settings.team.activity.you')
      : entry.person
        ? `@${entry.person.username}`
        : t('settings.team.activity.former');

  const renderEntry = (entry: TeamActivityEntry) => (
    <li
      key={entry.id}
      className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/2 p-3"
    >
      <UserAvatar
        src={entry.person?.avatar || undefined}
        alt={entry.person?.username || ''}
        size="md"
        className="w-10 h-10 rounded-full object-cover shrink-0"
      />
      <div className="min-w-0">
        <p className="text-sm text-white">
          <span className="font-semibold">{who(entry)}</span>{' '}
          {t(`settings.team.activity.action.${entry.action}`, {
            context: entry.byOwner ? 'you' : undefined,
          })}
        </p>
        <p className="text-xs text-white/50">
          <time dateTime={entry.createdAt}>
            {new Date(entry.createdAt).toLocaleString(i18n.language, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </p>
      </div>
    </li>
  );

  return (
    <SettingsSection
      title={t('settings.team.activity.title')}
      description={t('settings.team.activity.desc')}
      card={false}
    >
      {activity.isError ? (
        <p className="text-sm text-white/60">
          {t('settings.team.activity.error')}
        </p>
      ) : activity.isPending ? null : entries.length === 0 ? (
        <p className="text-sm text-white/60">
          {t('settings.team.activity.empty')}
        </p>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">{entries.map(renderEntry)}</ul>
          {activity.hasNextPage && (
            <Button
              variant="outline"
              onClick={() => activity.fetchNextPage()}
              isLoading={activity.isFetchingNextPage}
              disabled={activity.isFetchingNextPage}
              className="min-h-11 button-alone text-sm font-semibold"
            >
              {t('settings.team.activity.more')}
            </Button>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
