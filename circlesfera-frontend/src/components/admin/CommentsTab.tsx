import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import type { AdminComment } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { ActionButton, Pagination, SearchInput, Table } from './AdminTable';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function CommentsTab({ onToast }: Props) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminComment>>({
    queryKey: ['admin', 'comments', page, debouncedSearch],
    queryFn: () =>
      adminApi
        .getComments(page, 10, debouncedSearch || undefined)
        .then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'comments'] });
      onToast('Comentario eliminado', 'success');
    },
    onError: () => onToast('Error al eliminar comentario', 'error'),
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
          placeholder="Buscar comentarios..."
        />
      </div>

      <div className="glass-panel rounded-2xl overflow-clip border border-white/10">
        <Table
          headers={['Autor', 'Comentario', 'Post', 'Fecha', 'Acciones']}
          loading={isLoading}
          isEmpty={!data?.data?.length}
        >
          {data?.data?.map((comment) => (
            <tr
              key={comment.id}
              className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
            >
              <td className="px-4 py-3">
                <span className="text-white text-sm font-medium max-w-[100px] lg:max-w-[150px] truncate block" title={comment.user?.profile?.username}>
                  @{comment.user?.profile?.username || 'unknown'}
                </span>
              </td>
              <td className="px-4 py-3">
                <p className="text-gray-300 text-sm max-w-xs truncate">
                  {comment.content}
                </p>
              </td>
              <td className="px-4 py-3">
                <span className="text-gray-500 text-xs truncate max-w-[150px] block">
                  {comment.post?.caption?.slice(0, 40) || '—'}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 text-sm whitespace-nowrap">
                {new Date(comment.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <ActionButton
                  onClick={() => deleteMutation.mutate(comment.id)}
                  label="Eliminar"
                  variant="danger"
                  icon={Trash2}
                  iconOnly
                  disabled={deleteMutation.isPending}
                />
              </td>
            </tr>
          ))}
        </Table>
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      {/* Empty state icon */}
      {!isLoading && !data?.data?.length && (
        <div className="text-center py-12 text-gray-600">
          <MessageCircle size={48} className="mx-auto mb-3 opacity-50" />
          <p>No hay comentarios</p>
        </div>
      )}
    </div>
  );
}
