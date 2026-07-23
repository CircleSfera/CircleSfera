import { useQuery } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminHashtag } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { Pagination, SearchInput, Table } from './AdminTable';

export default function HashtagsTab() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminHashtag>>({
    queryKey: ['admin', 'hashtags', page, debouncedSearch],
    queryFn: () =>
      adminApi
        .getHashtags(page, 20, debouncedSearch || undefined)
        .then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.hashtags.title')}
        subtitle={t('admin.hashtags.subtitle')}
      />

      <AdminFilterBar>
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

      <div className="rounded-xl border border-white/10 lg:overflow-clip">
        <AdminList
          loading={isLoading}
          isEmpty={!data?.data?.length}
          emptyTitle={t('admin.hashtags.empty_title')}
          emptyDescription={t('admin.hashtags.empty_description')}
          mobile={
            <div className="space-y-2">
              {data?.data?.map((tag) => (
                <AdminListRow
                  key={tag.id}
                  title={
                    <span className="inline-flex items-center gap-2">
                      <Hash size={14} className="text-brand-primary" />
                      {tag.tag}
                    </span>
                  }
                  badge={
                    <span className="text-brand-primary font-semibold text-sm">
                      {t('admin.hashtags.posts_count', {
                        count: tag.postCount,
                      })}
                    </span>
                  }
                  meta={new Date(tag.createdAt).toLocaleDateString()}
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
              ]}
              columnWidths={[
                'w-[2.5rem]',
                'min-w-[8rem]',
                'w-[4.5rem]',
                'hidden lg:table-cell w-[6rem]',
              ]}
              loading={false}
              isEmpty={false}
            >
              {data?.data?.map((tag, i) => (
                <tr
                  key={tag.id}
                  className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="px-2 py-1 text-gray-600 text-sm font-semibold">
                    {(page - 1) * 20 + i + 1}
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Hash size={14} className="text-brand-primary shrink-0" />
                      <span
                        className="text-white font-semibold text-sm truncate"
                        title={tag.tag}
                      >
                        {tag.tag}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <span className="text-brand-primary font-semibold text-sm">
                      {tag.postCount}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-gray-500 text-sm whitespace-nowrap hidden lg:table-cell">
                    {new Date(tag.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </Table>
          }
        />
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>
    </div>
  );
}
