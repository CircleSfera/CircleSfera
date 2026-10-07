import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Bot, CheckCircle, Clock, PauseCircle, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  type AdminRiskCase,
  adminApi,
  type RiskCaseDecision,
  type RiskCaseStatus,
} from '../../services/admin.service';
import { formatDateTime } from '../../utils/format';
import ConfirmModal from '../modals/ConfirmModal';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { ActionButton, FilterDropdown, Pagination } from './AdminTable';
import { adminTabPath } from './adminNav';
import { adminToast } from './adminToast';

const DECISIONS: Array<{
  decision: RiskCaseDecision;
  icon: typeof CheckCircle;
  variant: 'success' | 'ghost' | 'danger';
}> = [
  { decision: 'DISMISSED', icon: CheckCircle, variant: 'success' },
  { decision: 'RESTRICTED', icon: Clock, variant: 'ghost' },
  { decision: 'BOT_LABEL', icon: Bot, variant: 'ghost' },
  { decision: 'SUSPENDED', icon: PauseCircle, variant: 'danger' },
  { decision: 'BANNED', icon: Ban, variant: 'danger' },
];

// Review queue for Profiles the spam and bot detector flagged. The detector
// only proposes; the decision is made here.
export default function SpamReviewTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RiskCaseStatus>('OPEN');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{
    riskCase: AdminRiskCase;
    decision: RiskCaseDecision;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'risk-cases', status, page],
    queryFn: () => adminApi.getRiskCases(status, page),
  });
  const { data: stats } = useQuery({
    queryKey: ['admin', 'risk-cases', 'stats'],
    queryFn: adminApi.getRiskCaseStats,
  });

  const resolveMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      decision: RiskCaseDecision;
      note?: string;
    }) => adminApi.resolveRiskCase(vars.id, vars.decision, vars.note),
    onSuccess: () => {
      adminToast(t('admin.spam_review.toast_resolved'), 'success');
      setPending(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'risk-cases'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'trust-queue'] });
    },
    onError: () => adminToast(t('admin.spam_review.toast_error'), 'error'),
  });

  const cases = data?.data ?? [];

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.spam_review.title')}
        subtitle={t('admin.spam_review.subtitle')}
      />

      {stats ? (
        <p className="text-xs text-white/60" data-testid="spam-review-stats">
          {t('admin.spam_review.stats', {
            open: stats.open,
            reviewed: stats.reviewedLast90Days,
            precision:
              stats.precision === null
                ? '—'
                : `${Math.round(stats.precision * 100)}%`,
          })}
        </p>
      ) : null}

      <AdminFilterBar>
        <FilterDropdown
          label={t('admin.spam_review.filter_status')}
          value={status}
          onChange={(v) => {
            setStatus(v as RiskCaseStatus);
            setPage(1);
          }}
          options={[
            { value: 'OPEN', label: t('admin.spam_review.status_open') },
            {
              value: 'ACTIONED',
              label: t('admin.spam_review.status_actioned'),
            },
            {
              value: 'DISMISSED',
              label: t('admin.spam_review.status_dismissed'),
            },
          ]}
        />
      </AdminFilterBar>

      {isLoading ? (
        <AdminListSkeleton />
      ) : cases.length === 0 ? (
        <AdminEmptyState
          title={t('admin.spam_review.empty_title')}
          description={t('admin.spam_review.empty_description')}
        />
      ) : (
        <div className="space-y-2">
          {cases.map((riskCase) => (
            <AdminListRow
              key={riskCase.id}
              title={`@${riskCase.profile.username}`}
              subtitle={
                <>
                  <span className="block">
                    {riskCase.signals
                      .map((s) =>
                        t(`admin.spam_review.signal.${s.key}`, {
                          value: s.value,
                        }),
                      )
                      .join(' · ')}
                  </span>
                  {riskCase.restrictedUntil ? (
                    <span className="block text-xs text-brand-accent mt-1">
                      {t('admin.spam_review.restricted_until', {
                        date: formatDateTime(
                          riskCase.restrictedUntil,
                          i18n.language,
                        ),
                      })}
                    </span>
                  ) : null}
                  {riskCase.decision ? (
                    <span className="block text-xs text-white/50 mt-1">
                      {t(`admin.spam_review.decision.${riskCase.decision}`)}
                      {riskCase.reviewedBy
                        ? ` · ${riskCase.reviewedBy.displayName}`
                        : ''}
                    </span>
                  ) : null}
                </>
              }
              badge={
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    riskCase.score >= 70
                      ? 'bg-brand-secondary/10 text-brand-secondary'
                      : 'bg-brand-accent/10 text-brand-accent'
                  }`}
                >
                  {t('admin.spam_review.score', { score: riskCase.score })}
                </span>
              }
              primaryAction={
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  <ActionButton
                    icon={User}
                    label={t('admin.spam_review.open_user')}
                    variant="ghost"
                    iconOnly
                    onClick={() =>
                      navigate(
                        adminTabPath(
                          'users',
                          `?userId=${encodeURIComponent(riskCase.profile.userId)}`,
                        ),
                      )
                    }
                  />
                  {riskCase.status === 'OPEN'
                    ? DECISIONS.map(({ decision, icon, variant }) => (
                        <ActionButton
                          key={decision}
                          icon={icon}
                          label={t(`admin.spam_review.decision.${decision}`)}
                          variant={variant}
                          iconOnly
                          onClick={() => setPending({ riskCase, decision })}
                          disabled={resolveMutation.isPending}
                        />
                      ))
                    : null}
                </div>
              }
            />
          ))}
          <div className="pt-2 border-t border-white/5">
            <Pagination meta={data?.meta} onPageChange={setPage} />
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={(note) => {
          if (!pending) return;
          resolveMutation.mutate({
            id: pending.riskCase.id,
            decision: pending.decision,
            note: note || undefined,
          });
        }}
        title={
          pending ? t(`admin.spam_review.decision.${pending.decision}`) : ''
        }
        message={
          pending
            ? t(`admin.spam_review.confirm.${pending.decision}`, {
                username: pending.riskCase.profile.username,
              })
            : ''
        }
        confirmText={
          pending ? t(`admin.spam_review.decision.${pending.decision}`) : ''
        }
        cancelText={t('admin.shared.cancel')}
        isDestructive={
          pending?.decision === 'SUSPENDED' || pending?.decision === 'BANNED'
        }
        isLoading={resolveMutation.isPending}
        showInput
        inputLabel={t('admin.spam_review.note_label')}
        inputRequired={false}
      />
    </div>
  );
}
