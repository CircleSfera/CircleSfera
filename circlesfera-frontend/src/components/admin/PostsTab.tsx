import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Download, ExternalLink, Eye, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminPost } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
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
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
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

      <div className="rounded-xl border border-white/10 lg:overflow-clip">
        <AdminList
          loading={isLoading}
          isEmpty={!data || data.data.length === 0}
          emptyTitle={t('admin.posts.empty_title')}
          emptyDescription={t('admin.posts.empty_description')}
          mobile={
            <div className="space-y-2">
              {data?.data.map((post) => (
                <AdminListRow
                  key={post.id}
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
                    <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-semibold uppercase tracking-wider text-gray-300 border border-white/10">
                      {post.type}
                    </span>
                  }
                  meta={
                    <>
                      <span>
                        {new Date(post.createdAt).toLocaleDateString()}
                      </span>
                      {post._count && (
                        <span className="hidden sm:inline">
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
                      onClick: () => setPreviewPost(post),
                    },
                    {
                      label: t('admin.posts.action_view_platform'),
                      onClick: () => window.open(`/post/${post.id}`, '_blank'),
                    },
                  ]}
                />
              ))}
            </div>
          }
          desktop={
            <Table
              headers={[
                t('admin.posts.col_post'),
                t('admin.posts.col_author'),
                t('admin.posts.col_date'),
                t('admin.posts.col_type'),
                t('admin.posts.col_stats'),
                t('admin.posts.col_actions'),
              ]}
              columnWidths={[
                'min-w-[12rem]',
                'w-[7rem]',
                'hidden lg:table-cell w-[6rem]',
                'w-[5rem]',
                'hidden xl:table-cell w-[6rem]',
                'w-[8rem]',
              ]}
              loading={false}
              isEmpty={false}
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
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      onClick={() => setPreviewPost(post)}
                      className="flex items-center gap-3 text-left group"
                      aria-label={t('admin.posts.preview_aria')}
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
                      <p
                        className="text-white text-sm truncate max-w-[12rem] xl:max-w-[16rem] group-hover:text-brand-primary transition-colors"
                        title={post.caption || noCaption}
                      >
                        {post.caption || noCaption}
                      </p>
                    </button>
                  </td>
                  <td className="px-2 py-1">
                    <span
                      className="text-gray-300 text-sm truncate block max-w-[7rem]"
                      title={`@${post.user?.profile?.username}`}
                    >
                      @{post.user?.profile?.username}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-gray-500 text-sm whitespace-nowrap hidden lg:table-cell">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-2 py-1">
                    <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-semibold uppercase tracking-wider text-gray-300 border border-white/10">
                      {post.type}
                    </span>
                  </td>
                  <td className="px-2 py-1 hidden xl:table-cell">
                    {post._count && (
                      <div className="text-xs text-gray-500">
                        {t('admin.posts.likes_comments_short', {
                          likes: post._count.likes,
                          comments: post._count.comments,
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex gap-1 items-center">
                      <ActionButton
                        onClick={() => setPreviewPost(post)}
                        label={t('admin.posts.action_view')}
                        variant="ghost"
                        icon={Eye}
                        iconOnly
                      />
                      <ActionButton
                        onClick={() => setDeleteId(post.id)}
                        label={t('admin.posts.action_delete')}
                        variant="danger"
                        icon={Trash2}
                        iconOnly
                        disabled={deleteMutation.isPending}
                      />
                      <a
                        href={`/post/${post.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('admin.posts.view_post_title')}
                        className="p-2 rounded-lg text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-white transition-all"
                        aria-label={t('admin.posts.view_post_aria')}
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </Table>
          }
        />
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      {previewPost && (
        <PostPreviewDrawer
          post={previewPost}
          onClose={() => setPreviewPost(null)}
        />
      )}

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
