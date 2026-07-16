import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Eye, Heart, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { AdminStory } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { ActionButton, Pagination, Table } from './AdminTable';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function StoriesTab({ onToast }: Props) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminStory>>({
    queryKey: ['admin', 'stories', page],
    queryFn: () => adminApi.getStories(page, 10).then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteStory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'stories'] });
      onToast('Historia eliminada', 'success');
    },
    onError: () => onToast('Error al eliminar historia', 'error'),
  });

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-lg overflow-clip border border-white/10">
        <Table
          headers={[
            'Preview',
            'Autor',
            'Tipo',
            'Estado',
            'Vistas',
            'Reacciones',
            'Acciones',
          ]}
          loading={isLoading}
          isEmpty={!data?.data?.length}
        >
          {data?.data?.map((story) => (
            <tr
              key={story.id}
              className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
            >
              <td className="px-2 py-1">
                <div className="w-10 h-10 rounded-lg bg-white/5 overflow-hidden">
                  {story.mediaType === 'video' ? (
                    <video
                      src={story.url}
                      className="w-full h-full object-cover"
                      muted
                    />
                  ) : (
                    <img
                      src={story.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              </td>
              <td className="px-2 py-1">
                <span className="text-white font-medium text-sm">
                  @{story.user?.profile?.username || 'unknown'}
                </span>
              </td>
              <td className="px-2 py-1">
                <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-black uppercase tracking-wider text-gray-300 border border-white/10">
                  {story.mediaType}
                </span>
              </td>
              <td className="px-2 py-1">
                {isExpired(story.expiresAt) ? (
                  <span className="text-gray-500 text-xs font-bold flex items-center gap-1">
                    <Clock size={10} /> Expirada
                  </span>
                ) : (
                  <span className="text-green-400 text-xs font-bold flex items-center gap-1">
                    <Clock size={10} /> Activa
                  </span>
                )}
              </td>
              <td className="px-2 py-1">
                <span className="flex items-center gap-1 text-gray-300 text-sm">
                  <Eye size={12} /> {story._count?.views || 0}
                </span>
              </td>
              <td className="px-2 py-1">
                <span className="flex items-center gap-1 text-pink-400 text-sm">
                  <Heart size={12} /> {story._count?.reactions || 0}
                </span>
              </td>
              <td className="px-2 py-1">
                <ActionButton
                  onClick={() => deleteMutation.mutate(story.id)}
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
    </div>
  );
}
