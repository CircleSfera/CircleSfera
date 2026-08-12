import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle, MessageCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminComment } from '../../services/admin.service';
import { adminApi, type EnhancedStats } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
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

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function CommentsTab({ onToast }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 400);

  const { data: statsData } = useQuery<EnhancedStats>({
    queryKey: ['admin', 'stats', 'enhanced'],
    queryFn: () => adminApi.getEnhancedStats(),
  });

  const { data, isLoading } = useQuery<PaginatedResponse<AdminComment>>({
    queryKey: ['admin', 'comments', page, debouncedSearch, segment],
    queryFn: () =>
      adminApi
        .getComments(page, 10, debouncedSearch || undefined)
        .then((r) => r.data as PaginatedResponse<AdminComment>),
  });

  const comments = data?.data ?? [];
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (args: { id: string; action: 'delete' | 'hide' }) => {
      if (args.action === 'delete') {
        await adminApi.deleteComment(args.id);
      }
    },
    onSuccess: (_, args) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      if (args.id === selectedId && args.action === 'delete')
        setSelectedId(null);
      onToast(
        args.action === 'delete'
          ? t('admin.comments.toast_deleted')
          : t('admin.comments.toast_hidden'),
        'success',
      );
    },
    onError: (_, args) => {
      onToast(
        args.action === 'delete'
          ? t('admin.comments.toast_delete_error')
          : t('admin.comments.toast_hide_error'),
        'error',
      );
    },
  });

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const noContent = t('admin.comments.no_content');

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.comments.title')}
        subtitle={t('admin.comments.subtitle')}
      />

      {/* KPI Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AdminKpiWidget
          title={t('admin.comments.kpi_engagement')}
          value={`${statsData?.engagement || 0}%`}
          icon={<MessageCircle size={20} />}
          trend={{ value: 2.1, label: t('admin.shared.this_month') }}
        />
        <AdminKpiWidget
          title={t('admin.comments.kpi_pending_reports')}
          value={statsData?.pendingReports.toLocaleString() || '0'}
          icon={<Ban size={20} />}
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
            { value: 'ALL', label: t('admin.shared.filter_all_recent') },
          ]}
        />
        <div className="flex-1 min-w-0 md:max-w-xs">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={t('admin.comments.search_placeholder')}
          />
        </div>
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selectedId}
        onBack={() => setSelectedId(null)}
        onClearSelection={() => setSelectedId(null)}
        listTitle={t('admin.comments.title')}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {isLoading ? (
                <AdminListSkeleton rows={6} />
              ) : comments.length === 0 ? (
                <AdminEmptyState
                  icon={MessageCircle}
                  title={
                    search.length > 0
                      ? t('admin.comments.empty_title')
                      : t('admin.comments.empty_title')
                  }
                  description={
                    search.length > 0
                      ? t('admin.comments.empty_description')
                      : t('admin.comments.empty_description')
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
                comments.map((comment) => (
                  <AdminListRow
                    key={comment.id}
                    onClick={() => setSelectedId(comment.id)}
                    className={
                      selectedId === comment.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={comment.content || noContent}
                    subtitle={`@${
                      comment.user?.profile?.username ||
                      t('admin.shared.unknown')
                    } • ${new Date(comment.createdAt).toLocaleDateString()}`}
                    avatar={
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/50">
                        {comment.user?.profile?.username
                          ?.charAt(0)
                          .toUpperCase() || '?'}
                      </div>
                    }
                    primaryAction={
                      <ActionButton
                        onClick={() => setConfirmDelete(comment.id)}
                        label={t('admin.comments.action_delete')}
                        variant="danger"
                        icon={Trash2}
                        disabled={mutation.isPending}
                      />
                    }
                  />
                ))
              )}
            </div>
            <div className="shrink-0 pt-2 border-t border-white/5">
              <Pagination meta={data?.meta} onPageChange={setPage} />
            </div>
          </div>
        }
        detail={
          selectedId ? (
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-4">
                {t('admin.comments.detail_title')}
              </h3>
              {comments.find((c) => c.id === selectedId) && (
                <div className="space-y-4">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-white/70">
                      {comments.find((c) => c.id === selectedId)?.content ||
                        noContent}
                    </p>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="danger"
                      onClick={() => setConfirmDelete(selectedId)}
                      disabled={mutation.isPending}
                    >
                      <Trash2 size={16} className="mr-2" />
                      {t('admin.comments.action_delete')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <AdminEmptyState
              icon={CheckCircle}
              title={t('admin.shared.select_item_title')}
              description={t('admin.shared.select_item_description')}
            />
          )
        }
      />

      <ConfirmModal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete)
            mutation.mutate({ id: confirmDelete, action: 'delete' });
          setConfirmDelete(null);
        }}
        title={t('admin.comments.confirm_delete_title')}
        message={t('admin.comments.confirm_delete_message')}
        confirmText={t('admin.comments.confirm_delete')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={true}
        isLoading={mutation.isPending}
      />
    </div>
  );
}
