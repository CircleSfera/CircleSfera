import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminComment } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { ActionButton, Pagination, SearchInput, Table } from './AdminTable';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function CommentsTab({ onToast }: Props) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);

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
    <div className="space-y-4">
      <AdminPageHeader
        title="Comentarios"
        subtitle="Modera comentarios reportados o inapropiados"
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar comentarios..."
          />
        </div>
      </AdminFilterBar>

      <div className="rounded-xl border border-white/10 lg:overflow-clip">
        <AdminList
          loading={isLoading}
          isEmpty={!data?.data?.length}
          emptyTitle="No hay comentarios"
          emptyDescription="No se encontraron comentarios con los filtros seleccionados."
          mobile={
            <div className="space-y-2">
              {data?.data?.map((comment) => (
                <AdminListRow
                  key={comment.id}
                  title={`@${comment.user?.profile?.username || 'unknown'}`}
                  subtitle={comment.content}
                  meta={
                    <>
                      <span>
                        Post: {comment.post?.caption?.slice(0, 40) || '—'}
                      </span>
                      <span>
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                    </>
                  }
                  primaryAction={
                    <ActionButton
                      onClick={() => deleteMutation.mutate(comment.id)}
                      label="Eliminar"
                      variant="danger"
                      icon={Trash2}
                      disabled={deleteMutation.isPending}
                    />
                  }
                />
              ))}
            </div>
          }
          desktop={
            <Table
              headers={['Autor', 'Comentario', 'Post', 'Fecha', 'Acciones']}
              loading={false}
              isEmpty={false}
            >
              {data?.data?.map((comment) => (
                <tr
                  key={comment.id}
                  className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="px-2 py-1">
                    <span
                      className="text-white text-sm font-medium max-w-[100px] lg:max-w-[150px] truncate block"
                      title={comment.user?.profile?.username}
                    >
                      @{comment.user?.profile?.username || 'unknown'}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <p className="text-gray-300 text-sm max-w-xs truncate">
                      {comment.content}
                    </p>
                  </td>
                  <td className="px-2 py-1">
                    <span className="text-gray-500 text-xs truncate max-w-[150px] block">
                      {comment.post?.caption?.slice(0, 40) || '—'}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-gray-500 text-sm whitespace-nowrap">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-2 py-1">
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
          }
        />
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>
    </div>
  );
}
