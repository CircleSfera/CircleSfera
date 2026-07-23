import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, EyeOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminComment } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { ActionButton, Pagination, SearchInput, Table } from './AdminTable';

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

export default function CommentsTab({ onToast }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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

  const comments = data?.data ?? [];

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

      <div className="rounded-xl border border-white/10 lg:overflow-clip">
        <AdminList
          loading={isLoading}
          isEmpty={!comments.length}
          emptyTitle={t('admin.comments.empty_title')}
          emptyDescription={t('admin.comments.empty_description')}
          mobile={
            <div className="space-y-2">
              {comments.map((comment) => (
                <AdminListRow
                  key={comment.id}
                  title={`@${comment.user?.profile?.username || t('admin.shared.unknown')}`}
                  subtitle={
                    <span className="line-clamp-2">{comment.content}</span>
                  }
                  badge={moderationBadge(comment.moderationStatus)}
                  meta={new Date(comment.createdAt).toLocaleDateString()}
                  primaryAction={renderActions(comment)}
                />
              ))}
            </div>
          }
          desktop={
            <Table
              headers={[
                t('admin.comments.col_author'),
                t('admin.comments.col_comment'),
                t('admin.comments.col_moderation'),
                t('admin.comments.col_post'),
                t('admin.comments.col_date'),
                t('admin.comments.col_actions'),
              ]}
              columnWidths={[
                'w-[7rem]',
                'min-w-[10rem]',
                'w-[5.5rem]',
                'hidden xl:table-cell min-w-[8rem]',
                'hidden lg:table-cell w-[6rem]',
                'w-[6rem]',
              ]}
              loading={false}
              isEmpty={false}
            >
              {comments.map((comment) => (
                <tr
                  key={comment.id}
                  className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="px-2 py-1">
                    <span className="text-white text-sm font-medium truncate block max-w-[7rem]">
                      @
                      {comment.user?.profile?.username ||
                        t('admin.shared.unknown')}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <p
                      className="text-gray-300 text-sm truncate max-w-[16rem] xl:max-w-[20rem]"
                      title={comment.content}
                    >
                      {comment.content}
                    </p>
                  </td>
                  <td className="px-2 py-1">
                    {moderationBadge(comment.moderationStatus)}
                  </td>
                  <td className="px-2 py-1 hidden xl:table-cell">
                    <span
                      className="text-gray-500 text-xs truncate block max-w-[8rem]"
                      title={comment.post?.caption || undefined}
                    >
                      {comment.post?.caption || '—'}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-gray-500 text-sm whitespace-nowrap hidden lg:table-cell">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-2 py-1">{renderActions(comment)}</td>
                </tr>
              ))}
            </Table>
          }
        />
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

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
