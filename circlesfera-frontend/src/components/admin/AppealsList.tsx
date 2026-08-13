import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, User, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  type AppealStatus,
  getAdminAppeals,
  updateAdminAppeal,
} from '../../services/appeals.service';
import ConfirmModal from '../modals/ConfirmModal';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminListRow } from './AdminList';
import { AdminListSkeleton } from './AdminSkeletons';
import { ActionButton, Pagination } from './AdminTable';
import { adminTabPath } from './adminNav';
import { adminToast } from './adminToast';

interface AppealsListProps {
  statusFilter?: AppealStatus;
  page?: number;
  limit?: number;
  showPagination?: boolean;
  onPageChange?: (page: number) => void;
}

export default function AppealsList({
  statusFilter,
  page: controlledPage,
  limit = 20,
  showPagination = true,
  onPageChange,
}: AppealsListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [internalPage, setInternalPage] = useState(1);
  const page = controlledPage ?? internalPage;
  const [reviewModal, setReviewModal] = useState<{
    id: string;
    status: 'APPROVED' | 'REJECTED';
  } | null>(null);

  const handlePageChange = (nextPage: number) => {
    if (onPageChange) {
      onPageChange(nextPage);
    } else {
      setInternalPage(nextPage);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'appeals', page, limit, statusFilter],
    queryFn: () => getAdminAppeals(page, limit, statusFilter),
  });

  const appeals = data?.data ?? [];

  const updateMutation = useMutation({
    mutationFn: (params: {
      id: string;
      status: 'APPROVED' | 'REJECTED';
      adminNotes?: string;
    }) =>
      updateAdminAppeal(params.id, {
        status: params.status,
        adminNotes: params.adminNotes,
      }),
    onSuccess: () => {
      adminToast(t('admin.appeals.toast_updated'), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'appeals'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'trust-queue'] });
      setReviewModal(null);
    },
    onError: () => {
      adminToast(t('admin.appeals.toast_error'), 'error');
    },
  });

  if (isLoading) {
    return <AdminListSkeleton rows={4} />;
  }

  if (appeals.length === 0) {
    return (
      <AdminEmptyState
        icon={CheckCircle}
        title={
          statusFilter
            ? t('admin.appeals.empty_filtered_title')
            : t('admin.appeals.empty_title')
        }
        description={
          statusFilter
            ? t('admin.appeals.empty_filtered_description')
            : t('admin.appeals.empty_description')
        }
        compact
      />
    );
  }

  return (
    <div className="space-y-2">
      {appeals.map((appeal) => (
        <AdminListRow
          key={appeal.id}
          title={t('admin.appeals.user_label', {
            email: appeal.user?.email || '—',
          })}
          subtitle={
            <>
              <span className="block">
                @{appeal.user?.profile?.username || '—'} · {appeal.reason}
              </span>
              {appeal.targetPreview?.text ? (
                <span className="block text-xs text-white/50 mt-1">
                  {t('admin.appeals.target_preview')}:{' '}
                  {appeal.targetPreview.text}
                  {appeal.targetPreview.moderationStatus
                    ? ` (${appeal.targetPreview.moderationStatus})`
                    : ''}
                </span>
              ) : null}
              {appeal.adminNotes ? (
                <span className="block text-xs text-white/50 mt-1">
                  {t('admin.appeals.admin_notes', 'Notes')}: {appeal.adminNotes}
                </span>
              ) : null}
            </>
          }
          badge={
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                appeal.status === 'PENDING'
                  ? 'bg-amber-500/10 text-amber-500'
                  : appeal.status === 'APPROVED'
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-red-500/10 text-red-500'
              }`}
            >
              {appeal.status}
            </span>
          }
          meta={
            <span className="text-xs font-medium uppercase text-brand-primary">
              {appeal.targetType}
            </span>
          }
          primaryAction={
            <div className="flex gap-1 sm:gap-2">
              <ActionButton
                icon={User}
                label={t('admin.appeals.open_user')}
                variant="ghost"
                iconOnly
                onClick={() =>
                  navigate(
                    adminTabPath(
                      'users',
                      `?userId=${encodeURIComponent(appeal.userId)}`,
                    ),
                  )
                }
              />
              {appeal.status === 'PENDING' ? (
                <>
                  <ActionButton
                    icon={CheckCircle}
                    label={t('admin.appeals.approve')}
                    variant="success"
                    iconOnly
                    onClick={() =>
                      setReviewModal({ id: appeal.id, status: 'APPROVED' })
                    }
                    disabled={updateMutation.isPending}
                  />
                  <ActionButton
                    icon={XCircle}
                    label={t('admin.appeals.reject')}
                    variant="danger"
                    iconOnly
                    onClick={() =>
                      setReviewModal({ id: appeal.id, status: 'REJECTED' })
                    }
                    disabled={updateMutation.isPending}
                  />
                </>
              ) : null}
            </div>
          }
        />
      ))}
      {showPagination && (
        <div className="pt-2 border-t border-white/5">
          <Pagination meta={data?.meta} onPageChange={handlePageChange} />
        </div>
      )}

      <ConfirmModal
        isOpen={reviewModal !== null}
        onClose={() => setReviewModal(null)}
        onConfirm={(notes) => {
          if (!reviewModal) return;
          updateMutation.mutate({
            id: reviewModal.id,
            status: reviewModal.status,
            adminNotes: notes || undefined,
          });
        }}
        title={
          reviewModal?.status === 'APPROVED'
            ? t('admin.appeals.approve')
            : t('admin.appeals.reject')
        }
        message={
          reviewModal?.status === 'APPROVED'
            ? t('admin.appeals.notes_prompt')
            : t('admin.appeals.notes_prompt_reject')
        }
        confirmText={
          reviewModal?.status === 'APPROVED'
            ? t('admin.appeals.approve')
            : t('admin.appeals.reject')
        }
        cancelText={t('admin.shared.cancel')}
        isDestructive={reviewModal?.status === 'REJECTED'}
        isLoading={updateMutation.isPending}
        showInput
        inputLabel={t('admin.appeals.admin_notes', 'Notes')}
        inputRequired={false}
      />
    </div>
  );
}
