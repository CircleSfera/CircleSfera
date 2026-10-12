import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Bot,
  CheckCircle,
  Clock,
  Inbox,
  PauseCircle,
  Target,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  type AdminRiskCase,
  adminApi,
  type RiskCaseDecision,
  type RiskCaseStatus,
} from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { formatDateTime, formatWaiting } from '../../utils/format';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminSegmentedControl } from './AdminSegmentedControl';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { Pagination } from './AdminTable';
import { adminTabPath } from './adminNav';
import { adminToast } from './adminToast';
import StatCard from './StatCard';

const DECISIONS: Array<{
  decision: RiskCaseDecision;
  icon: typeof CheckCircle;
  variant: 'success' | 'outline' | 'danger';
}> = [
  { decision: 'DISMISSED', icon: CheckCircle, variant: 'success' },
  { decision: 'RESTRICTED', icon: Clock, variant: 'outline' },
  { decision: 'BOT_LABEL', icon: Bot, variant: 'outline' },
  { decision: 'SUSPENDED', icon: PauseCircle, variant: 'danger' },
  { decision: 'BANNED', icon: Ban, variant: 'danger' },
];

// Review queue for Profiles the spam and bot detector flagged. The detector
// only proposes; the decision is made here, in the open case.
export default function SpamReviewTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canDecide = useAdminAuthStore((s) => s.hasPermission('users.ban'));
  const [status, setStatus] = useState<RiskCaseStatus>('OPEN');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      // The case is decided: it closes, so it cannot be decided twice from
      // the copy the list still holds.
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'risk-cases'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'trust-queue'] });
    },
    onError: () => adminToast(t('admin.spam_review.toast_error'), 'error'),
  });

  const cases = data?.data ?? [];
  const selected = cases.find((c) => c.id === selectedId) ?? null;
  const signalText = (signal: AdminRiskCase['signals'][number]) =>
    t(`admin.spam_review.signal.${signal.key}`, { value: signal.value });
  const riskPill = (riskCase: AdminRiskCase) => (
    <span
      className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${
        riskCase.score >= 70
          ? 'bg-brand-secondary/10 text-brand-secondary'
          : 'bg-brand-accent/10 text-brand-accent'
      }`}
    >
      {t('admin.spam_review.score', { score: riskCase.score })}
    </span>
  );

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.spam_review.title')}
        subtitle={t('admin.spam_review.subtitle')}
      />

      {stats ? (
        <div
          className="grid grid-cols-3 gap-2 sm:gap-3"
          data-testid="spam-review-stats"
        >
          <StatCard
            compact
            label={t('admin.spam_review.stat_open')}
            value={stats.open}
            icon={Inbox}
            color="yellow"
          />
          <StatCard
            compact
            label={t('admin.spam_review.stat_reviewed')}
            value={stats.reviewedLast90Days}
            icon={CheckCircle}
            color="purple"
          />
          <StatCard
            compact
            label={t('admin.spam_review.stat_precision')}
            value={
              stats.precision === null ? 0 : Math.round(stats.precision * 100)
            }
            // Before any review there is no share to show.
            formatValue={
              stats.precision === null ? () => '—' : (value) => `${value}%`
            }
            isCounter={false}
            icon={Target}
            color="green"
          />
        </div>
      ) : null}

      <AdminFilterBar>
        <AdminSegmentedControl
          value={status}
          onChange={(next) => {
            setStatus(next as RiskCaseStatus);
            setPage(1);
            setSelectedId(null);
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

      <AdminSplitView
        hasSelection={!!selected}
        onBack={() => setSelectedId(null)}
        onClearSelection={() => setSelectedId(null)}
        listAriaLabel={t('admin.spam_review.title')}
        detailAriaLabel={t('admin.spam_review.case_title')}
        list={
          isLoading ? (
            <AdminListSkeleton />
          ) : cases.length === 0 ? (
            <AdminEmptyState
              title={t('admin.spam_review.empty_title')}
              description={t('admin.spam_review.empty_description')}
              compact
            />
          ) : (
            <div className="space-y-2">
              {cases.map((riskCase) => (
                <AdminListRow
                  key={riskCase.id}
                  onClick={() => setSelectedId(riskCase.id)}
                  selected={selectedId === riskCase.id}
                  title={`@${riskCase.profile.username}`}
                  subtitle={
                    riskCase.signals.length === 0
                      ? undefined
                      : riskCase.signals.length === 1
                        ? signalText(riskCase.signals[0])
                        : t('admin.spam_review.signal_more', {
                            signal: signalText(riskCase.signals[0]),
                            count: riskCase.signals.length - 1,
                          })
                  }
                  meta={formatWaiting(riskCase.createdAt, i18n.language, t)}
                  badge={riskPill(riskCase)}
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
                    @{selected.profile.username}
                  </h3>
                  {selected.profile.fullName && (
                    <p className="text-sm text-white/60">
                      {selected.profile.fullName}
                    </p>
                  )}
                </div>
                <span className="shrink-0">{riskPill(selected)}</span>
              </div>

              <div>
                <h4 className="text-xs font-medium text-white/40 mb-1.5">
                  {t('admin.spam_review.signals_label')}
                </h4>
                <ul className="text-sm text-white/80 divide-y divide-white/5 border-y border-white/5">
                  {selected.signals.map((signal) => (
                    <li key={signal.key} className="py-2">
                      {signalText(signal)}
                    </li>
                  ))}
                </ul>
              </div>

              {selected.restrictedUntil && (
                <p className="text-sm text-brand-accent">
                  {t('admin.spam_review.restricted_until', {
                    date: formatDateTime(
                      selected.restrictedUntil,
                      i18n.language,
                    ),
                  })}
                </p>
              )}
              {selected.decision && (
                <p className="text-sm text-white/60">
                  {t(`admin.spam_review.decision.${selected.decision}`)}
                  {selected.reviewedBy
                    ? ` · ${selected.reviewedBy.displayName}`
                    : ''}
                </p>
              )}

              {selected.status === 'OPEN' && !canDecide && (
                <p className="text-sm text-white/50">
                  {t('admin.shared.read_only_role')}
                </p>
              )}

              <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                {selected.status === 'OPEN' &&
                  canDecide &&
                  DECISIONS.map(({ decision, icon: Icon, variant }) => (
                    <Button
                      key={decision}
                      variant={variant}
                      className="min-h-11"
                      disabled={resolveMutation.isPending}
                      onClick={() =>
                        setPending({ riskCase: selected, decision })
                      }
                    >
                      <Icon size={16} className="mr-2 shrink-0" />
                      {t(`admin.spam_review.decision.${decision}`)}
                    </Button>
                  ))}
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() =>
                    navigate(
                      adminTabPath(
                        'users',
                        `?userId=${encodeURIComponent(selected.profile.userId)}`,
                      ),
                    )
                  }
                >
                  <User size={16} className="mr-2 shrink-0" />
                  {t('admin.spam_review.open_user')}
                </Button>
              </div>
            </div>
          )
        }
      />

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
