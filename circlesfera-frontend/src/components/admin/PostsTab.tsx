import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Download, ExternalLink, Eye, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import type { AdminPost } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import {
  ActionButton,
  FilterDropdown,
  Pagination,
  SearchInput,
  Table,
} from './AdminTable';
import PostPreviewDrawer from './PostPreviewDrawer';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function PostsTab({ onToast }: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const debouncedSearch = useDebounce(search);
  const queryClient = useQueryClient();

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewPost, setPreviewPost] = useState<AdminPost | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminPost>>({
    queryKey: ['admin', 'posts', page, debouncedSearch, typeFilter],
    queryFn: () =>
      adminApi
        .getPosts(
          page,
          10,
          debouncedSearch || undefined,
          typeFilter || undefined,
        )
        .then((res) => res.data as PaginatedResponse<AdminPost>),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deletePost(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'posts'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setDeleteId(null);
      onToast('Publicación eliminada', 'success');
    },
    onError: () => onToast('Error al eliminar publicación', 'error'),
  });

  const handleExport = async () => {
    try {
      const res = await adminApi.exportPostsCSV();
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'circlesfera-posts.csv';
      a.click();
      URL.revokeObjectURL(url);
      onToast('CSV descargado', 'success');
    } catch {
      onToast('Error al exportar CSV', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar publicaciones..."
          />
          <FilterDropdown
            label="Filtrar por tipo"
            value={typeFilter}
            onChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
            options={[
              { value: '', label: 'Todos los tipos' },
              { value: 'POST', label: 'Posts' },
              { value: 'FRAME', label: 'Frames' },
            ]}
          />
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-xl text-sm font-bold transition-all border border-white/10"
          aria-label="Exportar publicaciones como CSV"
        >
          <Download size={16} />
          Exportar CSV
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-clip border border-white/10">
        <Table
          headers={[
            'Publicación',
            'Autor',
            'Fecha',
            'Tipo',
            'Stats',
            'Acciones',
          ]}
          loading={isLoading}
          isEmpty={!data || data.data.length === 0}
        >
          {data?.data.map((post) => (
            <motion.tr
              key={post.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
            >
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setPreviewPost(post)}
                  className="flex items-center gap-3 text-left group"
                  aria-label="Vista previa de publicación"
                >
                  <div className="w-12 h-12 rounded-lg bg-white/5 overflow-hidden shrink-0 group-hover:ring-2 ring-brand-primary/50 transition-all">
                    {post.media?.[0]?.url && (
                      <img
                        src={post.media[0].url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <p className="text-white text-sm truncate max-w-[200px] group-hover:text-brand-primary transition-colors">
                    {post.caption || '(Sin pie de foto)'}
                  </p>
                </button>
              </td>
              <td className="px-4 py-3">
                <span
                  className="text-gray-300 text-sm max-w-[100px] lg:max-w-[150px] truncate block"
                  title={post.user?.profile?.username}
                >
                  @{post.user?.profile?.username}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 text-sm whitespace-nowrap">
                {new Date(post.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-black uppercase tracking-wider text-gray-400 border border-white/10">
                  {post.type}
                </span>
              </td>
              <td className="px-4 py-3">
                {post._count && (
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <p>
                      <span className="text-white font-bold">
                        {post._count.likes}
                      </span>{' '}
                      likes
                    </p>
                    <p>
                      <span className="text-white font-bold">
                        {post._count.comments}
                      </span>{' '}
                      comentarios
                    </p>
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5 items-center">
                  <ActionButton
                    onClick={() => setPreviewPost(post)}
                    label="Ver"
                    variant="ghost"
                    icon={Eye}
                    iconOnly
                  />
                  <ActionButton
                    onClick={() => setDeleteId(post.id)}
                    label="Eliminar"
                    variant="danger"
                    icon={Trash2}
                    iconOnly
                    disabled={deleteMutation.isPending}
                  />
                  <a
                    href={`/post/${post.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ver post"
                    className="p-2 rounded-lg text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-white transition-all"
                    aria-label="Ver publicación en la plataforma"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </td>
            </motion.tr>
          ))}
        </Table>
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      {/* Preview Drawer */}
      {previewPost && (
        <PostPreviewDrawer
          post={previewPost}
          onClose={() => setPreviewPost(null)}
        />
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="¿Eliminar publicación?"
        message="Esta acción es irreversible y eliminará el contenido permanentemente de la plataforma."
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDestructive={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
