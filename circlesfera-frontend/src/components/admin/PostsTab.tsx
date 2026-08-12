import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  ExternalLink,
  Eye,
  Flag,
  ImageIcon,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminPost } from '../../services/admin.service';
import { adminApi, type EnhancedStats } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { platformOrigin } from '../../utils/adminPanel';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminKpiWidget } from './AdminKpiWidget';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminSegmentedControl } from './AdminSegmentedControl';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { ActionButton, Pagination, SearchInput } from './AdminTable';
import {
  AdminUserFilterChip,
  useAdminQueueUserFilter,
} from './AdminUserFilterChip';
import PostDetailPanel from './PostDetailPanel';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function PostsTab({ onToast }: Props) {
  const { t } = useTranslation();
  const { userId, username, clearUserFilter } = useAdminQueueUserFilter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState(() => (userId ? 'ALL' : 'FLAGGED'));
  const debouncedSearch = useDebouncedValue(search, 400);
  const queryClient = useQueryClient();

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  useEffect(() => {
    setSegment(userId ? 'ALL' : 'FLAGGED');
    setPage(1);
    setSelectedPostId(null);
  }, [userId]);

  const typeFilter =
    segment === 'FRAME' ? 'FRAME' : segment === 'POST' ? 'POST' : undefined;
  const moderationStatus = segment === 'FLAGGED' ? 'FLAGGED' : undefined;

  const { data: statsData } = useQuery<EnhancedStats>({
    queryKey: ['admin', 'stats', 'enhanced'],
    queryFn: () => adminApi.getEnhancedStats(),
  });

  const { data, isLoading } = useQuery<PaginatedResponse<AdminPost>>({
    queryKey: [
      'admin',
      'posts',
      page,
      debouncedSearch,
      typeFilter,
      segment,
      userId,
    ],
    queryFn: () =>
      adminApi
        .getPosts(
          page,
          10,
          debouncedSearch || undefined,
          typeFilter,
          userId,
          moderationStatus,
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
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.posts.title')}
        subtitle={t('admin.posts.subtitle')}
        actions={
          <Button
            onClick={handleExport}
            variant="outline"
            className="text-sm font-semibold text-white/70 hover:text-white border-white/10 px-4 min-h-11 w-full sm:w-auto"
            aria-label={t('admin.posts.export_csv_aria')}
          >
            <Download size={16} className="mr-2" />
            {t('admin.posts.export_csv')}
          </Button>
        }
      />

      {/* KPI Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <AdminKpiWidget
          title={t('admin.posts.kpi_total')}
          value={statsData?.posts.toLocaleString() || '0'}
          icon={<ImageIcon size={16} />}
          trend={{
            value: statsData?.postGrowth || 0,
            label: t('admin.shared.this_month'),
          }}
        />
        <AdminKpiWidget
          title={t('admin.posts.kpi_new_week')}
          value={statsData?.newPostsThisWeek.toLocaleString() || '0'}
          icon={<TrendingUp size={16} />}
          iconColorClass="text-green-400 bg-green-400/10"
        />
        <AdminKpiWidget
          title={t('admin.posts.kpi_reported_pct')}
          value={`${statsData?.reportedContentPercent || 0}%`}
          icon={<Flag size={16} />}
          iconColorClass="text-amber-400 bg-amber-400/10"
        />
      </div>

      <AdminFilterBar>
        <AdminSegmentedControl
          value={segment}
          onChange={(v) => {
            setSegment(v);
            setPage(1);
          }}
          options={[
            { value: 'FLAGGED', label: t('admin.shared.filter_flagged') },
            { value: 'ALL', label: t('admin.shared.filter_all_recent') },
            { value: 'POST', label: t('admin.posts.segment_type_post') },
            { value: 'FRAME', label: t('admin.posts.segment_type_frame') },
          ]}
        />
        {userId && (
          <AdminUserFilterChip username={username} onClear={clearUserFilter} />
        )}
        <div className="flex-1 min-w-0 md:max-w-xs">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={t('admin.posts.search_placeholder')}
          />
        </div>
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
                  title={
                    search.length > 0
                      ? t('admin.posts.empty_title')
                      : t('admin.posts.empty_title')
                  }
                  description={
                    search.length > 0
                      ? t('admin.posts.empty_description')
                      : t('admin.posts.empty_description')
                  }
                  action={
                    search.length > 0 ? (
                      <Button
                        onClick={() => {
                          setSearch('');
                          setPage(1);
                        }}
                        variant="secondary"
                        className="min-h-11 mt-2"
                      >
                        {t('admin.shared.clear_filters')}
                      </Button>
                    ) : undefined
                  }
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
                      <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-semibold uppercase tracking-wider text-white/70 border border-white/5">
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
                        icon: Eye,
                        onClick: () => setSelectedPostId(post.id),
                      },
                      {
                        label: t('admin.posts.action_view_platform'),
                        icon: ExternalLink,
                        onClick: () =>
                          window.open(
                            `${platformOrigin()}/post/${post.id}`,
                            '_blank',
                          ),
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
