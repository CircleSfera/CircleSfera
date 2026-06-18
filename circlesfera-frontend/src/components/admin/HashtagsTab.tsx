import { useQuery } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import type { AdminHashtag } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { Pagination, SearchInput, Table } from './AdminTable';

export default function HashtagsTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminHashtag>>({
    queryKey: ['admin', 'hashtags', page, debouncedSearch],
    queryFn: () =>
      adminApi
        .getHashtags(page, 20, debouncedSearch || undefined)
        .then((r) => r.data),
  });

  return (
    <div className="space-y-6">
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

      <div className="glass-panel rounded-2xl overflow-clip border border-white/10">
        <Table
          headers={['#', 'Hashtag', 'Posts', 'Creado']}
          loading={isLoading}
          isEmpty={!data?.data?.length}
        >
          {data?.data?.map((tag, i) => (
            <tr
              key={tag.id}
              className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
            >
              <td className="px-4 py-3 text-gray-600 text-sm font-bold">
                {(page - 1) * 20 + i + 1}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Hash size={14} className="text-brand-primary" />
                  <span className="text-white font-bold text-sm">
                    {tag.tag}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="text-brand-primary font-black text-lg">
                  {tag.postCount}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 text-sm whitespace-nowrap">
                {new Date(tag.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </Table>
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>
    </div>
  );
}
