import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ImageIcon, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminPost } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import {
  ActionButton,
  FilterDropdown,
  Pagination,
  SearchInput,
} from './AdminTable';
import PostDetailPanel from './PostDetailPanel';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function PostsTab({ onToast }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const queryClient = useQueryClient();

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

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

  const posts = data?.data ?? [];
  const selectedPost = posts.find((p) => p.id === selectedPostId) ?? null;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deletePost(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'posts'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setDeleteId(null);
      if (selectedPostId === id) setSelectedPostId(null);
      onToast(t('admin.posts.toast_deleted'), 'success');
    },
    onError: () => onToast(t('admin.posts.toast_delete_error'), 'error'),
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
      onToast(t('admin.posts.toast_csv_exported'), 'success');
    } catch {
      onToast(t('admin.posts.toast_csv_error'), 'error');
    }
  };

  const noCaption = t('admin.posts.no_caption');

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.posts.title')}
        subtitle={t('admin.posts.subtitle')}
        actions={
          <Button
            onClick={handleExport}
            variant="outline"
            className="text-sm font-semibold text-gray-300 hover:text-white border-white/10 px-4 min-h-11 w-full sm:w-auto"
            aria-label={t('admin.posts.export_csv_aria')}
          >
            <Download size={16} className="mr-2" />
            {t('admin.posts.export_csv')}
          </Button>
        }
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={t('admin.posts.search_placeholder')}
          />
        </div>
        <FilterDropdown
          label={t('admin.posts.filter_type')}
          value={typeFilter}
          onChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
          options={[
            { value: '', label: t('admin.posts.type_all') },
            { value: 'POST', label: t('admin.posts.type_post') },
            { value: 'FRAME', label: t('admin.posts.type_frame') },
          ]}
        />
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selectedPost}
        onBack={() => setSelectedPostId(null)}
        onClearSelection={() => setSelectedPostId(null)}
        listTitle={t('admin.posts.title')}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {isLoading ? (
                <AdminListSkeleton rows={6} />
              ) : posts.length === 0 ? (
                <AdminEmptyState
                  icon={ImageIcon}
                  title={t('admin.posts.empty_title')}
                  description={t('admin.posts.empty_description')}
                  compact
                />
              ) : (
                posts.map((post) => (
                  <AdminListRow
                    key={post.id}
                    onClick={() => setSelectedPostId(post.id)}
                    className={
                      selectedPostId === post.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={post.caption || noCaption}
                    subtitle={`@${post.user?.profile?.username || t('admin.shared.unknown')}`}
                    avatar={
                      <div className="w-12 h-12 rounded-lg bg-white/5 overflow-hidden">
                        {post.media?.[0]?.url && (
                          <img
                            src={post.media[0].url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                    }
                    badge={
                      <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-semibold uppercase tracking-wider text-gray-300 border border-white/5">
                        {post.type}
                      </span>
                    }
                    meta={
                      <>
                        <span>
                          {new Date(post.createdAt).toLocaleDateString()}
                        </span>
                        {post._count && (
                          <span>
                            {t('admin.posts.likes_comments', {
                              likes: post._count.likes,
                              comments: post._count.comments,
                            })}
                          </span>
                        )}
                      </>
                    }
                    primaryAction={
                      <ActionButton
                        onClick={() => setDeleteId(post.id)}
                        label={t('admin.posts.action_delete')}
                        variant="danger"
                        icon={Trash2}
                        disabled={deleteMutation.isPending}
                      />
                    }
                    secondaryActions={[
                      {
                        label: t('admin.posts.action_preview'),
                        onClick: () => setSelectedPostId(post.id),
                      },
                      {
                        label: t('admin.posts.action_view_platform'),
                        onClick: () =>
                          window.open(`/post/${post.id}`, '_blank'),
                      },
                    ]}
                  />
                ))
              )}
            </div>
            <div className="shrink-0 pt-2 border-t border-white/5">
              <Pagination meta={data?.meta} onPageChange={setPage} />
            </div>
          </div>
        }
        detail={selectedPost ? <PostDetailPanel post={selectedPost} /> : null}
      />

      <ConfirmModal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title={t('admin.posts.confirm_delete_title')}
        message={t('admin.posts.confirm_delete_message')}
        confirmText={t('admin.posts.confirm_delete')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
