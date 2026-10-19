import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Link2Off, RefreshCw, Unlock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { adminApi, type BlockedLinkDomain } from '../../services/admin.service';
import { formatDay } from '../../utils/format';
import ConfirmModal from '../modals/ConfirmModal';
import { Button, Input } from '../ui';
import { ADMIN_PAGE_LIST_STATE, AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { SearchInput } from './AdminTable';
import { adminToast } from './adminToast';

const LABEL =
  'text-xs font-semibold uppercase tracking-wide text-white/50 ml-1';

/**
 * The domains no link on a story may point to, nor their subdomains. Staff
 * who moderate content add one with why, and take it off again.
 */
export default function LinkDomainsTab() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [toUnblock, setToUnblock] = useState<BlockedLinkDomain | null>(null);

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
    queryKey: ['admin', 'link-domains', debouncedSearch],
    queryFn: ({ pageParam }) =>
      adminApi
        .getLinkDomainsPage(
          debouncedSearch.trim() || undefined,
          pageParam || undefined,
        )
        .then((r) => r.data),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
  const domains = data?.pages.flatMap((p) => p.items ?? []) ?? [];
  const loadMoreRef = useInfiniteScroll(
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  );
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'link-domains'] });

  const block = useMutation({
    mutationFn: () => adminApi.blockLinkDomain(domain.trim(), reason.trim()),
    onSuccess: ({ data: row }) => {
      adminToast(
        t('admin.link_domains.toast_blocked', { domain: row.domain }),
        'success',
      );
      setDomain('');
      setReason('');
      void refresh();
    },
    onError: (err) => {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      adminToast(
        t(
          status === 409
            ? 'admin.link_domains.toast_exists'
            : status === 400
              ? 'admin.link_domains.toast_invalid'
              : 'admin.link_domains.toast_error',
        ),
        'error',
      );
    },
  });

  const unblock = useMutation({
    mutationFn: (row: BlockedLinkDomain) => adminApi.unblockLinkDomain(row.id),
    onSuccess: (_res, row) => {
      adminToast(
        t('admin.link_domains.toast_unblocked', { domain: row.domain }),
        'success',
      );
      void refresh();
    },
    onError: () => adminToast(t('admin.link_domains.toast_error'), 'error'),
    onSettled: () => setToUnblock(null),
  });

  const rows = (
    <div className="space-y-2">
      {domains.map((row) => (
        <AdminListRow
          key={row.id}
          title={
            <span className="inline-flex items-center gap-2 min-w-0">
              <Link2Off
                size={14}
                className="text-brand-primary-text shrink-0"
              />
              <span className="truncate">{row.domain}</span>
            </span>
          }
          subtitle={row.reason ?? undefined}
          meta={
            row.createdBy
              ? t('admin.link_domains.added_by', {
                  name: row.createdBy.displayName,
                  date: formatDay(row.createdAt, i18n.language),
                })
              : t('admin.link_domains.added_on', {
                  date: formatDay(row.createdAt, i18n.language),
                })
          }
          actionBeside
          primaryAction={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-11"
              disabled={unblock.isPending}
              onClick={() => setToUnblock(row)}
            >
              <Unlock size={14} aria-hidden />
              {t('admin.link_domains.unblock')}
            </Button>
          }
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.link_domains.title')}
        subtitle={t('admin.link_domains.subtitle')}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (domain.trim()) block.mutate();
        }}
        className="grid gap-2.5 rounded-2xl border border-white/8 bg-white/3 p-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
      >
        <div className="space-y-1.5">
          <label htmlFor="link-domain" className={LABEL}>
            {t('admin.link_domains.label_domain')}
          </label>
          <Input
            id="link-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={t('admin.link_domains.placeholder_domain')}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={253}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="link-domain-reason" className={LABEL}>
            {t('admin.link_domains.label_reason')}
          </label>
          <Input
            id="link-domain-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('admin.link_domains.placeholder_reason')}
            maxLength={300}
          />
        </div>
        <Button
          type="submit"
          disabled={!domain.trim() || block.isPending}
          isLoading={block.isPending}
        >
          {t('admin.link_domains.block')}
        </Button>
      </form>

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('admin.link_domains.search_placeholder')}
          />
        </div>
      </AdminFilterBar>

      {isError ? (
        // A list that could not be read is not an empty one.
        <div className={ADMIN_PAGE_LIST_STATE}>
          <AdminEmptyState
            icon={Link2Off}
            title={t('admin.link_domains.load_failed')}
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
                {t('admin.link_domains.retry')}
              </Button>
            }
          />
        </div>
      ) : (
        <AdminList
          loading={isLoading}
          isEmpty={domains.length === 0}
          emptyTitle={t('admin.link_domains.empty_title')}
          emptyDescription={t('admin.link_domains.empty_description')}
          mobile={rows}
          desktop={rows}
        />
      )}

      {/* Outside the list, which is drawn twice, once hidden. */}
      {hasNextPage && <div ref={loadMoreRef} aria-hidden className="h-1" />}

      <ConfirmModal
        isOpen={toUnblock !== null}
        onClose={() => setToUnblock(null)}
        onConfirm={() => {
          if (toUnblock) unblock.mutate(toUnblock);
        }}
        title={t('admin.link_domains.unblock_title', {
          domain: toUnblock?.domain ?? '',
        })}
        message={t('admin.link_domains.unblock_message')}
        confirmText={t('admin.link_domains.unblock')}
        cancelText={t('admin.shared.cancel')}
        isLoading={unblock.isPending}
      />
    </div>
  );
}
