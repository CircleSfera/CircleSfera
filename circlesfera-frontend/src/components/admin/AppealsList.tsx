import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AppealStatus,
  getAdminAppeals,
  updateAdminAppeal,
} from '../../services/appeals.service';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminListRow } from './AdminList';
import { AdminListSkeleton } from './AdminSkeletons';
import { ActionButton, Pagination } from './AdminTable';
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
  const queryClient = useQueryClient();
  const [internalPage, setInternalPage] = useState(1);
  const page = controlledPage ?? internalPage;

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
              <span>{appeal.reason}</span>
              {appeal.adminNotes ? (
                <span className="block text-xs text-gray-400 mt-1">
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
            appeal.status === 'PENDING' ? (
              <div className="flex gap-1 sm:gap-2">
                <ActionButton
                  icon={CheckCircle}
                  label={t('admin.appeals.approve')}
                  variant="success"
                  iconOnly
                  onClick={() => {
                    const note = window.prompt(
                      t(
                        'admin.appeals.notes_prompt',
                        'Optional admin notes (leave empty to skip):',
                      ),
                    );
                    updateMutation.mutate({
                      id: appeal.id,
                      status: 'APPROVED',
                      adminNotes: note || undefined,
                    });
                  }}
                  disabled={updateMutation.isPending}
                />
                <ActionButton
                  icon={XCircle}
                  label={t('admin.appeals.reject')}
                  variant="danger"
                  iconOnly
                  onClick={() => {
                    const note = window.prompt(
                      t(
                        'admin.appeals.notes_prompt_reject',
                        'Reason for rejection (optional):',
                      ),
                    );
                    updateMutation.mutate({
                      id: appeal.id,
                      status: 'REJECTED',
                      adminNotes: note || undefined,
                    });
                  }}
                  disabled={updateMutation.isPending}
                />
              </div>
            ) : undefined
          }
        />
      ))}
      {showPagination && (
        <div className="pt-2 border-t border-white/5">
          <Pagination meta={data?.meta} onPageChange={handlePageChange} />
        </div>
      )}
    </div>
  );
}
