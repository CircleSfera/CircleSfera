import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock, Eye, EyeOff, Heart, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminStory } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { ActionButton, FilterDropdown, Pagination, Table } from './AdminTable';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

function moderationBadge(status: AdminStory['moderationStatus']) {
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

export default function StoriesTab({ onToast }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [expiredFilter, setExpiredFilter] = useState('');
  const [moderationFilter, setModerationFilter] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminStory>>({
    queryKey: ['admin', 'stories', page, expiredFilter, moderationFilter],
    queryFn: () =>
      adminApi
        .getStories(page, 10, {
          expired: (expiredFilter || undefined) as 'true' | 'false' | undefined,
          moderationStatus: moderationFilter || undefined,
        })
        .then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteStory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'stories'] });
      onToast(t('admin.stories.toast_deleted'), 'success');
    },
    onError: () => onToast(t('admin.stories.toast_delete_error'), 'error'),
  });

  const moderationMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'VISIBLE' | 'HIDDEN';
    }) => adminApi.updateModerationStatus('STORY', id, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'stories'] });
      onToast(
        t(
          variables.status === 'VISIBLE'
            ? 'admin.stories.toast_restored'
            : 'admin.stories.toast_hidden',
        ),
        'success',
      );
    },
    onError: () => onToast(t('admin.stories.toast_moderation_error'), 'error'),
  });

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  const expiryBadge = (expired: boolean) =>
    expired ? (
      <span className="text-gray-500 text-xs font-semibold flex items-center gap-1">
        <Clock size={10} /> {t('admin.stories.status_expired')}
      </span>
    ) : (
      <span className="text-green-400 text-xs font-semibold flex items-center gap-1">
        <Clock size={10} /> {t('admin.stories.status_active')}
      </span>
    );

  const renderActions = (story: AdminStory) => (
    <div className="flex gap-1">
      {story.moderationStatus === 'HIDDEN' ? (
        <ActionButton
          onClick={() =>
            moderationMutation.mutate({ id: story.id, status: 'VISIBLE' })
          }
          label={t('admin.stories.action_restore')}
          variant="success"
          icon={CheckCircle}
          iconOnly
          disabled={moderationMutation.isPending}
        />
      ) : (
        <ActionButton
          onClick={() =>
            moderationMutation.mutate({ id: story.id, status: 'HIDDEN' })
          }
          label={t('admin.stories.action_hide')}
          variant="warning"
          icon={EyeOff}
          iconOnly
          disabled={moderationMutation.isPending}
        />
      )}
      <ActionButton
        onClick={() => setConfirmDeleteId(story.id)}
        label={t('admin.stories.action_delete')}
        variant="danger"
        icon={Trash2}
        iconOnly
        disabled={deleteMutation.isPending}
      />
    </div>
  );

  const stories = data?.data ?? [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.stories.title')}
        subtitle={t('admin.stories.subtitle')}
      />

      <AdminFilterBar>
        <FilterDropdown
          label={t('admin.stories.filter_expired')}
          value={expiredFilter}
          onChange={(v) => {
            setExpiredFilter(v);
            setPage(1);
          }}
          options={[
            { value: '', label: t('admin.stories.expired_all') },
            { value: 'false', label: t('admin.stories.status_active') },
            { value: 'true', label: t('admin.stories.status_expired') },
          ]}
        />
        <FilterDropdown
          label={t('admin.stories.filter_moderation')}
          value={moderationFilter}
          onChange={(v) => {
            setModerationFilter(v);
            setPage(1);
          }}
          options={[
            { value: '', label: t('admin.shared.all') },
            { value: 'VISIBLE', label: 'VISIBLE' },
            { value: 'FLAGGED', label: 'FLAGGED' },
            { value: 'HIDDEN', label: 'HIDDEN' },
            { value: 'REMOVED', label: 'REMOVED' },
          ]}
        />
      </AdminFilterBar>

      <AdminList
        loading={isLoading}
        isEmpty={!stories.length}
        emptyTitle={t('admin.stories.empty_title')}
        emptyDescription={t('admin.stories.empty_description')}
        mobile={
          <div className="space-y-2">
            {stories.map((story) => (
              <AdminListRow
                key={story.id}
                title={`@${story.user?.profile?.username || t('admin.shared.unknown')}`}
                subtitle={
                  <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-semibold uppercase tracking-wider text-gray-300 border border-white/10">
                    {story.mediaType}
                  </span>
                }
                avatar={
                  <div className="w-12 h-12 rounded-lg bg-white/5 overflow-hidden">
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
                }
                badge={
                  <div className="flex flex-col items-end gap-1">
                    {moderationBadge(story.moderationStatus)}
                    {expiryBadge(isExpired(story.expiresAt))}
                  </div>
                }
                meta={
                  <span className="flex items-center gap-1">
                    <Eye size={12} />{' '}
                    {t('admin.stories.views_count', {
                      count: story._count?.views || 0,
                    })}
                    <span className="hidden sm:inline text-pink-400">
                      · <Heart size={12} className="inline" />{' '}
                      {story._count?.reactions || 0}
                    </span>
                  </span>
                }
                primaryAction={renderActions(story)}
              />
            ))}
          </div>
        }
        desktop={
          <Table
            headers={[
              t('admin.stories.col_preview'),
              t('admin.stories.col_author'),
              t('admin.stories.col_type'),
              t('admin.stories.col_moderation'),
              t('admin.stories.col_status'),
              t('admin.stories.col_views'),
              t('admin.stories.col_reactions'),
              t('admin.stories.col_actions'),
            ]}
            columnWidths={[
              'w-[3rem]',
              'min-w-[6rem]',
              'w-[5rem]',
              'w-[5.5rem]',
              'w-[5.5rem]',
              'w-[4.5rem]',
              'hidden xl:table-cell w-[5rem]',
              'w-[6rem]',
            ]}
            loading={false}
            isEmpty={false}
          >
            {stories.map((story) => (
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
                  <span className="text-white font-medium text-sm truncate block max-w-[6rem]">
                    @
                    {story.user?.profile?.username || t('admin.shared.unknown')}
                  </span>
                </td>
                <td className="px-2 py-1">
                  <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-semibold uppercase tracking-wider text-gray-300 border border-white/10">
                    {story.mediaType}
                  </span>
                </td>
                <td className="px-2 py-1">
                  {moderationBadge(story.moderationStatus)}
                </td>
                <td className="px-2 py-1">
                  {expiryBadge(isExpired(story.expiresAt))}
                </td>
                <td className="px-2 py-1">
                  <span className="flex items-center gap-1 text-gray-300 text-sm">
                    <Eye size={12} /> {story._count?.views || 0}
                  </span>
                </td>
                <td className="px-2 py-1 hidden xl:table-cell">
                  <span className="flex items-center gap-1 text-pink-400 text-sm">
                    <Heart size={12} /> {story._count?.reactions || 0}
                  </span>
                </td>
                <td className="px-2 py-1">{renderActions(story)}</td>
              </tr>
            ))}
          </Table>
        }
      />
      <Pagination meta={data?.meta} onPageChange={setPage} />

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) {
            deleteMutation.mutate(confirmDeleteId);
          }
          setConfirmDeleteId(null);
        }}
        title={t('admin.stories.confirm_delete_title')}
        message={t('admin.stories.confirm_delete_message')}
        confirmText={t('admin.stories.confirm_delete')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={true}
      />
    </div>
  );
}
