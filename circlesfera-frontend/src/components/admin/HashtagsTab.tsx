import { useQuery } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import { useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminHashtag } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { AdminList, AdminListRow } from './AdminList';
import { Pagination, SearchInput, Table } from './AdminTable';

export default function HashtagsTab() {
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
      <div className="flex flex-wrap gap-4 items-center">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Buscar hashtags..."
        />
      </div>

      <div className="glass-panel rounded-lg overflow-clip border border-white/10">
        <AdminList
          loading={isLoading}
          isEmpty={!data?.data?.length}
          emptyTitle="No hay hashtags"
          emptyDescription="No se encontraron hashtags con los filtros seleccionados."
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
                      {tag.postCount} posts
                    </span>
                  }
                  meta={new Date(tag.createdAt).toLocaleDateString()}
                />
              ))}
            </div>
          }
          desktop={
            <Table
              headers={['#', 'Hashtag', 'Posts', 'Creado']}
              loading={false}
              isEmpty={false}
            >
              {data?.data?.map((tag, i) => (
                <tr
                  key={tag.id}
                  className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="px-2 py-1 text-gray-600 text-sm font-bold">
                    {(page - 1) * 20 + i + 1}
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-2">
                      <Hash size={14} className="text-brand-primary" />
                      <span className="text-white font-bold text-sm">
                        {tag.tag}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <span className="text-brand-primary font-semibold text-lg">
                      {tag.postCount}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-gray-500 text-sm whitespace-nowrap">
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
