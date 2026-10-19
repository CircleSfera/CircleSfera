import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { RefreshCw, Scale } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import {
  type IllegalNotice,
  type IllegalNoticeStatus,
  illegalNoticesApi,
} from '../../services/illegalNotices.service';
import { formatDay } from '../../utils/format';
import { Button } from '../ui';
import { Textarea } from '../ui/Textarea';
import { ADMIN_PAGE_LIST_STATE, AdminEmptyState } from './AdminEmptyState';
import { ADMIN_PAGE_ROW, AdminList } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { adminToast } from './adminToast';

/**
 * Notices of illegal content from anyone, with or without an account
 * (Digital Services Act Art. 16). Child sexual abuse material comes first.
 * Staff decide each one with the reasons, which are emailed to the notifier.
 * Each tab is read a page at a time, most recent first, and the next page
 * loads as staff scroll near the end.
 */
export default function IllegalNoticesTab() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<IllegalNoticeStatus>('RECEIVED');

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['admin', 'illegal-notices', status],
    queryFn: ({ pageParam }) =>
      illegalNoticesApi
        .page(status, pageParam || undefined)
        .then((r) => r.data),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
  const notices = data?.pages.flatMap((p) => p.items ?? []) ?? [];
  const loadMoreRef = useInfiniteScroll(
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  );

  const rows = (
    <div className="space-y-2">
      {notices.map((notice) => (
        <NoticeRow
          key={notice.id}
          notice={notice}
          date={formatDay(notice.createdAt, i18n.language)}
          onDecided={() =>
            queryClient.invalidateQueries({
              queryKey: ['admin', 'illegal-notices'],
            })
          }
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.illegal_notices.title')}
        subtitle={t('admin.illegal_notices.subtitle')}
      />
      <div className="flex flex-wrap gap-2">
        {(['RECEIVED', 'ACTIONED', 'NO_ACTION'] as const).map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant={status === s ? 'primary' : 'secondary'}
            aria-pressed={status === s}
            className="min-h-11"
            onClick={() => setStatus(s)}
          >
            {t(`admin.illegal_notices.status_${s}`)}
          </Button>
        ))}
      </div>
      {isError ? (
        <div className={ADMIN_PAGE_LIST_STATE}>
          <AdminEmptyState
            icon={Scale}
            title={t('admin.illegal_notices.load_failed')}
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                isLoading={isFetching}
                onClick={() => void refetch()}
              >
                <RefreshCw size={14} aria-hidden />
                {t('admin.illegal_notices.retry')}
              </Button>
            }
          />
        </div>
      ) : (
        <AdminList
          loading={isLoading}
          isEmpty={notices.length === 0}
          emptyTitle={t('admin.illegal_notices.empty_title')}
          emptyDescription={t('admin.illegal_notices.empty_description')}
          mobile={rows}
          desktop={rows}
        />
      )}
      {/* Outside the list, which is drawn twice, once hidden. */}
      {hasNextPage && <div ref={loadMoreRef} aria-hidden className="h-1" />}
    </div>
  );
}

function NoticeRow({
  notice,
  date,
  onDecided,
}: {
  notice: IllegalNotice;
  date: string;
  onDecided: () => void;
}) {
  const { t } = useTranslation();
  const [reasons, setReasons] = useState('');
  const decide = useMutation({
    mutationFn: (outcome: 'ACTIONED' | 'NO_ACTION') =>
      illegalNoticesApi.decide(notice.id, outcome, reasons.trim()),
    onSuccess: () => {
      adminToast(t('admin.illegal_notices.toast_decided'), 'success');
      onDecided();
    },
    onError: () => adminToast(t('admin.illegal_notices.toast_error'), 'error'),
  });
  const ready = reasons.trim().length >= 10 && !decide.isPending;

  return (
    <article className={`border ${ADMIN_PAGE_ROW}`}>
      <a
        href={notice.contentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block truncate text-sm font-semibold text-white underline underline-offset-2"
      >
        {notice.contentUrl}
      </a>
      {notice.childAbuse && (
        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-brand-secondary">
          {t('admin.illegal_notices.child_abuse')}
        </p>
      )}
      <p className="mt-1 whitespace-pre-line text-sm text-white/80">
        {notice.explanation}
      </p>
      <p className="mt-1 text-xs text-white/50">
        {notice.notifierEmail
          ? t('admin.illegal_notices.from', {
              name: notice.notifierName ?? '',
              email: notice.notifierEmail,
              date,
            })
          : t('admin.illegal_notices.anonymous', { date })}
      </p>
      {notice.status === 'RECEIVED' ? (
        <div className="mt-2 space-y-2">
          <Textarea
            label={t('admin.illegal_notices.reasons_label')}
            rows={3}
            maxLength={5000}
            value={reasons}
            onChange={(e) => setReasons(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-11"
              disabled={!ready}
              onClick={() => decide.mutate('ACTIONED')}
            >
              {t('admin.illegal_notices.actioned')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-11"
              disabled={!ready}
              onClick={() => decide.mutate('NO_ACTION')}
            >
              {t('admin.illegal_notices.no_action')}
            </Button>
          </div>
        </div>
      ) : (
        notice.decision && (
          <p className="mt-2 text-sm text-white/70">{notice.decision}</p>
        )
      )}
    </article>
  );
}
