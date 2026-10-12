import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, User, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  type Appeal,
  type AppealStatus,
  getAdminAppeals,
  updateAdminAppeal,
} from '../../services/appeals.service';
import { formatDay, formatWaiting } from '../../utils/format';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminSegmentedControl } from './AdminSegmentedControl';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { Pagination, StatusBadge } from './AdminTable';
import { adminTabPath } from './adminNav';
import { adminToast } from './adminToast';

const PAGE_SIZE = 20;

// The colour of the shared state pill for each state of an appeal.
const PILL: Record<AppealStatus, string> = {
  PENDING: 'pending',
  APPROVED: 'resolved',
  REJECTED: 'dismissed',
};

export default function AppealsTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // A queue opens on what waits.
  const [view, setView] = useState<AppealStatus | ''>('PENDING');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState<{
    id: string;
    status: 'APPROVED' | 'REJECTED';
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'appeals', page, PAGE_SIZE, view],
    queryFn: () => getAdminAppeals(page, PAGE_SIZE, view || undefined),
  });
  const appeals = data?.data ?? [];
  const selected = appeals.find((appeal) => appeal.id === selectedId) ?? null;

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
      // The case is decided: it closes, so it cannot be decided twice from
      // the copy the list still holds.
      setSelectedId(null);
      setReview(null);
    },
    onError: () => {
      adminToast(t('admin.appeals.toast_error'), 'error');
    },
  });

  const whatIsAppealed = (appeal: Appeal) =>
    t(`admin.audit.targets.${appeal.targetType}`, {
      defaultValue: appeal.targetType,
    });
  const statePill = (appeal: Appeal) => (
    <StatusBadge
      status={PILL[appeal.status]}
      label={t(`admin.appeals.state.${appeal.status}`)}
    />
  );

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.appeals.title')}
        subtitle={t('admin.appeals.subtitle')}
      />

      <AdminFilterBar>
        <AdminSegmentedControl
          value={view}
          onChange={(next) => {
            setView(next as AppealStatus | '');
            setPage(1);
            setSelectedId(null);
          }}
          options={[
            { value: 'PENDING', label: t('admin.appeals.status_pending') },
            { value: 'APPROVED', label: t('admin.appeals.status_approved') },
            { value: 'REJECTED', label: t('admin.appeals.status_rejected') },
            { value: '', label: t('admin.appeals.status_all') },
          ]}
        />
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selected}
        onBack={() => setSelectedId(null)}
        onClearSelection={() => setSelectedId(null)}
        listAriaLabel={t('admin.appeals.title')}
        detailAriaLabel={t('admin.appeals.case_title')}
        list={
          isLoading ? (
            <AdminListSkeleton rows={4} />
          ) : appeals.length === 0 ? (
            <AdminEmptyState
              icon={CheckCircle}
              title={
                view === 'PENDING'
                  ? t('admin.appeals.empty_title')
                  : t('admin.appeals.empty_filtered_title')
              }
              description={
                view === 'PENDING'
                  ? t('admin.appeals.empty_description')
                  : t('admin.appeals.empty_filtered_description')
              }
              compact
            />
          ) : (
            <div className="space-y-2">
              {appeals.map((appeal) => (
                <AdminListRow
                  key={appeal.id}
                  onClick={() => setSelectedId(appeal.id)}
                  selected={selectedId === appeal.id}
                  title={appeal.user?.email || '—'}
                  subtitle={`@${appeal.user?.profile?.username || '—'} · ${whatIsAppealed(appeal)}`}
                  meta={formatWaiting(appeal.createdAt, i18n.language, t)}
                  badge={statePill(appeal)}
                />
              ))}
              <Pagination meta={data?.meta} onPageChange={setPage} />
            </div>
          )
        }
        detail={
          selected && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white break-all">
                    {selected.user?.email || '—'}
                  </h3>
                  <p className="text-sm text-brand-primary">
                    @{selected.user?.profile?.username || '—'}
                  </p>
                </div>
                <span className="shrink-0">{statePill(selected)}</span>
              </div>

              <dl className="text-sm">
                <CaseLine label={t('admin.appeals.appealed_label')}>
                  {whatIsAppealed(selected)}
                </CaseLine>
                <CaseLine label={t('admin.appeals.sent_label')}>
                  {formatDay(selected.createdAt, i18n.language)}
                </CaseLine>
                {selected.targetPreview?.moderationStatus && (
                  <CaseLine label={t('admin.appeals.context_label')}>
                    {t(
                      `admin.appeals.context_state.${selected.targetPreview.moderationStatus}`,
                      {
                        defaultValue: selected.targetPreview.moderationStatus,
                      },
                    )}
                  </CaseLine>
                )}
                {/* Accounts and bot labels have nothing more to quote. */}
                {selected.targetPreview?.text &&
                  selected.targetPreview.type !== 'ACCOUNT' && (
                    <CaseText label={t('admin.appeals.target_preview')}>
                      {selected.targetPreview.text}
                    </CaseText>
                  )}
                <CaseText label={t('admin.appeals.reason_label')}>
                  {selected.reason}
                </CaseText>
                {selected.adminNotes && (
                  <CaseText label={t('admin.appeals.admin_notes')}>
                    {selected.adminNotes}
                  </CaseText>
                )}
              </dl>

              <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                {selected.status === 'PENDING' && (
                  <>
                    <Button
                      variant="success"
                      className="min-h-11"
                      disabled={updateMutation.isPending}
                      onClick={() =>
                        setReview({ id: selected.id, status: 'APPROVED' })
                      }
                    >
                      <CheckCircle size={16} className="mr-2" />
                      {t('admin.appeals.approve')}
                    </Button>
                    <Button
                      variant="danger"
                      className="min-h-11"
                      disabled={updateMutation.isPending}
                      onClick={() =>
                        setReview({ id: selected.id, status: 'REJECTED' })
                      }
                    >
                      <XCircle size={16} className="mr-2" />
                      {t('admin.appeals.reject')}
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() =>
                    navigate(
                      adminTabPath(
                        'users',
                        `?userId=${encodeURIComponent(selected.userId)}`,
                      ),
                    )
                  }
                >
                  <User size={16} className="mr-2" />
                  {t('admin.appeals.open_user')}
                </Button>
              </div>
            </div>
          )
        }
      />

      <ConfirmModal
        isOpen={review !== null}
        onClose={() => setReview(null)}
        onConfirm={(notes) =>
          review &&
          updateMutation.mutate({
            id: review.id,
            status: review.status,
            adminNotes: notes || undefined,
          })
        }
        title={
          review?.status === 'APPROVED'
            ? t('admin.appeals.approve_title')
            : t('admin.appeals.reject_title')
        }
        message={
          review?.status === 'APPROVED'
            ? t('admin.appeals.notes_prompt')
            : t('admin.appeals.notes_prompt_reject')
        }
        confirmText={
          review?.status === 'APPROVED'
            ? t('admin.appeals.approve')
            : t('admin.appeals.reject')
        }
        cancelText={t('admin.shared.cancel')}
        isDestructive={review?.status === 'REJECTED'}
        isLoading={updateMutation.isPending}
        showInput
        inputLabel={t('admin.appeals.admin_notes')}
        inputRequired={false}
      />
    </div>
  );
}

function CaseLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-white/5">
      <dt className="text-xs font-medium text-white/40 shrink-0 pt-0.5">
        {label}
      </dt>
      <dd className="text-white font-semibold text-right">{children}</dd>
    </div>
  );
}

function CaseText({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2.5 border-b border-white/5">
      <dt className="text-xs font-medium text-white/40 mb-1.5">{label}</dt>
      <dd className="text-sm text-white/80 whitespace-pre-wrap">{children}</dd>
    </div>
  );
}
