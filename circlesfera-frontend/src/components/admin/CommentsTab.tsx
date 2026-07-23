import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, EyeOff, MessageCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminComment } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { ActionButton, Pagination, SearchInput } from './AdminTable';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

function moderationBadge(status: AdminComment['moderationStatus']) {
  const styles: Record<string, string> = {
    VISIBLE: 'text-green-400 bg-green-400/10',
    FLAGGED: 'text-amber-400 bg-amber-400/10',
    HIDDEN: 'text-gray-400 bg-gray-400/10',
    REMOVED: 'text-red-400 bg-red-400/10',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${styles[status] || styles.VISIBLE}`}
    >
      {status}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-white/5 last:border-b-0">
      <dt className="text-xs font-medium text-gray-500 shrink-0">{label}</dt>
      <dd className="text-sm text-white text-right min-w-0 break-words">
        {value}
      </dd>
    </div>
  );
}

export default function CommentsTab({ onToast }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 400);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminComment>>({
    queryKey: ['admin', 'comments', page, debouncedSearch],
    queryFn: () =>
      adminApi
        .getComments(page, 10, debouncedSearch || undefined)
        .then((r) => r.data),
  });

  const comments = data?.data ?? [];
  const selected = comments.find((c) => c.id === selectedId) ?? null;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteComment(id),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'comments'] });
      if (selectedId === id) setSelectedId(null);
      onToast(t('admin.comments.toast_deleted'), 'success');
    },
    onError: () => onToast(t('admin.comments.toast_delete_error'), 'error'),
  });

  const moderationMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'VISIBLE' | 'HIDDEN';
    }) => adminApi.updateModerationStatus('COMMENT', id, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'comments'] });
      onToast(
        t(
          variables.status === 'VISIBLE'
            ? 'admin.comments.toast_restored'
            : 'admin.comments.toast_hidden',
        ),
        'success',
      );
    },
    onError: () => onToast(t('admin.comments.toast_moderation_error'), 'error'),
  });

  const renderActions = (comment: AdminComment) => (
    <div className="flex gap-1">
      {comment.moderationStatus === 'HIDDEN' ? (
        <ActionButton
          onClick={() =>
            moderationMutation.mutate({ id: comment.id, status: 'VISIBLE' })
          }
          label={t('admin.comments.action_restore')}
          variant="success"
          icon={CheckCircle}
          iconOnly
          disabled={moderationMutation.isPending}
        />
      ) : (
        <ActionButton
          onClick={() =>
            moderationMutation.mutate({ id: comment.id, status: 'HIDDEN' })
          }
          label={t('admin.comments.action_hide')}
          variant="warning"
          icon={EyeOff}
          iconOnly
          disabled={moderationMutation.isPending}
        />
      )}
      <ActionButton
        onClick={() => setConfirmDeleteId(comment.id)}
        label={t('admin.comments.action_delete')}
        variant="danger"
        icon={Trash2}
        iconOnly
        disabled={deleteMutation.isPending}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.comments.title')}
        subtitle={t('admin.comments.subtitle')}
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
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
        hasSelection={!!selected}
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
                  title={t('admin.comments.empty_title')}
                  description={t('admin.comments.empty_description')}
                  compact
                />
              ) : (
                comments.map((comment) => (
                  <AdminListRow
                    key={comment.id}
                    selected={selectedId === comment.id}
                    onClick={() => setSelectedId(comment.id)}
                    className={
                      selectedId === comment.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={`@${comment.user?.profile?.username || t('admin.shared.unknown')}`}
                    subtitle={
                      <span className="line-clamp-2">{comment.content}</span>
                    }
                    badge={moderationBadge(comment.moderationStatus)}
                    meta={new Date(comment.createdAt).toLocaleDateString()}
                    primaryAction={renderActions(comment)}
                  />
                ))
              )}
            </div>
            <div className="shrink-0">
              <Pagination meta={data?.meta} onPageChange={setPage} />
            </div>
          </div>
        }
        detail={
          selected ? (
            <div className="space-y-5 pb-6 px-0.5">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {t('admin.comments.col_comment')}
                </p>
                <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {selected.content}
                </p>
              </div>
              <dl>
                <MetaRow
                  label={t('admin.comments.col_author')}
                  value={`@${selected.user?.profile?.username || t('admin.shared.unknown')}`}
                />
                <MetaRow
                  label={t('admin.comments.col_moderation')}
                  value={moderationBadge(selected.moderationStatus)}
                />
                <MetaRow
                  label={t('admin.comments.col_post')}
                  value={selected.post?.caption || '—'}
                />
                <MetaRow
                  label={t('admin.comments.col_date')}
                  value={new Date(selected.createdAt).toLocaleString()}
                />
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                {renderActions(selected)}
              </div>
            </div>
          ) : null
        }
      />

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) {
            deleteMutation.mutate(confirmDeleteId);
          }
          setConfirmDeleteId(null);
        }}
        title={t('admin.comments.confirm_delete_title')}
        message={t('admin.comments.confirm_delete_message')}
        confirmText={t('admin.comments.confirm_delete')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
