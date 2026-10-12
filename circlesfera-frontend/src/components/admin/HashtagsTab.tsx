import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Hash } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminHashtag } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { formatDay } from '../../utils/format';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminSegmentedControl } from './AdminSegmentedControl';
import { Pagination, SearchInput, Table } from './AdminTable';
import { adminToast } from './adminToast';

export default function HashtagsTab() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [hiddenOnly, setHiddenOnly] = useState(false);
  // The hashtag staff is asked about before it is hidden.
  const [toHide, setToHide] = useState<AdminHashtag | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<AdminHashtag>>({
    queryKey: ['admin', 'hashtags', page, debouncedSearch, hiddenOnly],
    queryFn: () =>
      adminApi
        .getHashtags(page, 20, debouncedSearch || undefined, hiddenOnly)
        .then((r) => r.data),
  });

  const mutation = useMutation({
    mutationFn: ({ tag, hidden }: { tag: AdminHashtag; hidden: boolean }) =>
      adminApi.setHashtagHidden(tag.id, hidden),
    onSuccess: (_res, { tag, hidden }) => {
      adminToast(
        t(
          hidden ? 'admin.hashtags.toast_hidden' : 'admin.hashtags.toast_shown',
          {
            tag: tag.tag,
          },
        ),
        'success',
      );
      void queryClient.invalidateQueries({ queryKey: ['admin', 'hashtags'] });
    },
    onError: () => adminToast(t('admin.hashtags.toast_error'), 'error'),
    onSettled: () => setToHide(null),
  });
  // Hiding is asked first; showing again is done at once.
  const toggle = (tag: AdminHashtag) =>
    tag.isHidden ? mutation.mutate({ tag, hidden: false }) : setToHide(tag);
  const hiddenBadge = (
    <span className="px-2 py-0.5 rounded-full border border-white/20 bg-white/10 text-white/70 text-xs font-semibold">
      {t('admin.hashtags.hidden_badge')}
    </span>
  );

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.hashtags.title')}
        subtitle={t('admin.hashtags.subtitle')}
      />

      <AdminFilterBar>
        <AdminSegmentedControl
          ariaLabel={t('admin.hashtags.filter_label')}
          value={hiddenOnly ? 'hidden' : 'all'}
          onChange={(v) => {
            setHiddenOnly(v === 'hidden');
            setPage(1);
          }}
          options={[
            { value: 'all', label: t('admin.hashtags.filter_all') },
            { value: 'hidden', label: t('admin.hashtags.filter_hidden') },
          ]}
        />
        <div className="flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={t('admin.hashtags.search_placeholder')}
          />
        </div>
      </AdminFilterBar>

      <AdminList
        loading={isLoading}
        isEmpty={!data?.data?.length}
        emptyTitle={t(
          hiddenOnly && !debouncedSearch
            ? 'admin.hashtags.empty_hidden_title'
            : 'admin.hashtags.empty_title',
        )}
        emptyDescription={t('admin.hashtags.empty_description')}
        mobile={
          <div className="space-y-2">
            {data?.data?.map((tag) => (
              <AdminListRow
                key={tag.id}
                title={
                  <span className="inline-flex items-center gap-2">
                    <Hash size={14} className="text-brand-primary-text" />
                    {tag.tag}
                  </span>
                }
                badge={
                  <span className="inline-flex items-center gap-2">
                    {tag.isHidden && hiddenBadge}
                    <span className="text-brand-primary-text font-semibold text-sm">
                      {t('admin.hashtags.posts_count', {
                        count: tag.postCount,
                      })}
                    </span>
                  </span>
                }
                meta={formatDay(tag.createdAt, i18n.language)}
                secondaryActions={[
                  {
                    label: t(
                      tag.isHidden
                        ? 'admin.hashtags.show_again'
                        : 'admin.hashtags.hide',
                    ),
                    icon: tag.isHidden ? Eye : EyeOff,
                    disabled: mutation.isPending,
                    onClick: () => toggle(tag),
                  },
                ]}
              />
            ))}
          </div>
        }
        desktop={
          <Table
            headers={[
              t('admin.hashtags.col_rank'),
              t('admin.hashtags.col_hashtag'),
              t('admin.hashtags.col_posts'),
              t('admin.hashtags.col_created'),
              t('admin.hashtags.col_state'),
            ]}
            columnWidths={[
              'w-[2.5rem]',
              'min-w-[8rem]',
              'w-[4.5rem]',
              'hidden lg:table-cell w-[6rem]',
              'w-[14rem]',
            ]}
            loading={false}
            isEmpty={false}
          >
            {data?.data?.map((tag, i) => (
              <tr
                key={tag.id}
                className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
              >
                <td className="px-2 py-1 text-white/50 text-sm font-semibold">
                  {(page - 1) * 20 + i + 1}
                </td>
                <td className="px-2 py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <Hash
                      size={14}
                      className="text-brand-primary-text shrink-0"
                    />
                    <span
                      className="text-white font-semibold text-sm truncate"
                      title={tag.tag}
                    >
                      {tag.tag}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-1">
                  <span className="text-brand-primary-text font-semibold text-sm">
                    {tag.postCount}
                  </span>
                </td>
                <td className="px-2 py-1 text-white/50 text-sm whitespace-nowrap hidden lg:table-cell">
                  {formatDay(tag.createdAt, i18n.language)}
                </td>
                <td className="px-2 py-1">
                  <div className="flex items-center justify-between gap-2">
                    {tag.isHidden ? (
                      hiddenBadge
                    ) : (
                      <span className="text-white/50 text-sm">
                        {t('admin.hashtags.visible')}
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-9 text-xs"
                      disabled={mutation.isPending}
                      onClick={() => toggle(tag)}
                    >
                      {t(
                        tag.isHidden
                          ? 'admin.hashtags.show_again'
                          : 'admin.hashtags.hide',
                      )}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        }
      />
      <Pagination meta={data?.meta} onPageChange={setPage} />

      <ConfirmModal
        isOpen={toHide !== null}
        onClose={() => setToHide(null)}
        onConfirm={() => {
          if (toHide) mutation.mutate({ tag: toHide, hidden: true });
        }}
        title={t('admin.hashtags.hide_title', { tag: toHide?.tag ?? '' })}
        message={t('admin.hashtags.hide_message')}
        confirmText={t('admin.hashtags.hide')}
        cancelText={t('admin.shared.cancel')}
        isLoading={mutation.isPending}
      />
    </div>
  );
}
