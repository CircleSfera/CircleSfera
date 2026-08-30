import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  ExternalLink,
  Flag,
  LifeBuoy,
  Scale,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  type AdminSupportTicket,
  adminApi,
  type TrustQueueAppeal,
  type TrustQueueReport,
} from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { ADMIN_TAB_PERMISSIONS, adminTabPath } from './adminNav';

function formatMttrDuration(
  ms: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) {
    return t('admin.trust.mttr_duration_minutes', {
      count: Math.max(1, mins),
    });
  }
  const hrs = Math.round(mins / 60);
  if (hrs < 24) {
    return t('admin.trust.mttr_duration_hours', { count: hrs });
  }
  const days = Math.round(hrs / 24);
  return t('admin.trust.mttr_duration_days', { count: days });
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function TrustSection({
  icon: Icon,
  title,
  count,
  link,
  linkLabel,
  emptyTitle,
  emptyDescription,
  isEmpty,
  children,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  link: string;
  linkLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <div className="border border-white/5 bg-white/2 flex flex-col rounded-lg min-h-0">
      <div className="p-2.5 border-b border-white/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={16} className="text-brand-primary shrink-0" />
          <h3 className="text-sm font-semibold text-white truncate">{title}</h3>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
            {count}
          </span>
        </div>
        <Link
          to={link}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-primary/80 shrink-0 min-h-11 sm:min-h-0"
        >
          {linkLabel}
          <ExternalLink size={12} />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 sm:p-2 space-y-1.5 sm:space-y-2">
        {isEmpty ? (
          <AdminEmptyState
            icon={Shield}
            title={emptyTitle}
            description={emptyDescription}
            compact
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function AttentionChip({
  to,
  label,
  count,
  tone = 'brand',
}: {
  to: string;
  label: string;
  count: number;
  tone?: 'brand' | 'amber' | 'blue';
}) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
      : tone === 'blue'
        ? 'border-blue-400/30 bg-blue-400/10 text-blue-300'
        : 'border-brand-primary/30 bg-brand-primary/10 text-brand-primary';

  return (
    <Link
      to={to}
      className={`flex items-center justify-between gap-3 min-h-11 px-3 py-2 rounded-lg border ${toneClass} hover:opacity-90 transition-opacity`}
    >
      <span className="text-xs font-semibold truncate">{label}</span>
      <span className="text-sm font-bold tabular-nums shrink-0">{count}</span>
    </Link>
  );
}

export default function TrustTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasPermission = useAdminAuthStore((s) => s.hasPermission);
  const canOpenModeration = hasPermission(ADMIN_TAB_PERMISSIONS.moderation);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'trust-queue'],
    queryFn: () => adminApi.getTrustQueue().then((r) => r.data),
    refetchInterval: 60_000,
  });

  const counts = data?.counts ?? { reports: 0, appeals: 0, tickets: 0 };
  const reportMttr = data?.reportMttr;
  const reports = data?.reports ?? [];
  const appeals = data?.appeals ?? [];
  const tickets = data?.tickets ?? [];
  const totalAttention = counts.reports + counts.appeals + counts.tickets;

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.trust.title')}
        subtitle={t('admin.trust.subtitle')}
      />

      {!isLoading && (
        <div className="rounded-lg border border-white/5 bg-white/2 p-3 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">
                {totalAttention > 0
                  ? t('admin.trust.attention_title', { count: totalAttention })
                  : t('admin.trust.attention_clear_title')}
              </p>
              <p className="text-xs text-white/50 mt-0.5">
                {totalAttention > 0
                  ? t('admin.trust.attention_subtitle')
                  : t('admin.trust.attention_clear_subtitle')}
              </p>
            </div>
            <span
              className={`shrink-0 text-lg font-bold tabular-nums ${
                totalAttention > 0 ? 'text-brand-primary' : 'text-white/40'
              }`}
            >
              {totalAttention}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <AttentionChip
              to={adminTabPath('reports')}
              label={t('admin.trust.reports_title')}
              count={counts.reports}
            />
            <AttentionChip
              to={adminTabPath('appeals')}
              label={t('admin.trust.appeals_title')}
              count={counts.appeals}
              tone="amber"
            />
            <AttentionChip
              to={adminTabPath('support')}
              label={t('admin.trust.tickets_title')}
              count={counts.tickets}
              tone="blue"
            />
          </div>

          {canOpenModeration && (
            <Link
              to={adminTabPath('moderation')}
              className="flex items-center justify-between gap-2 min-h-11 px-3 py-2 rounded-lg border border-white/10 bg-white/3 text-white/80 hover:text-white hover:border-white/20 transition-colors"
            >
              <span className="inline-flex items-center gap-2 text-xs font-semibold">
                <ShieldAlert
                  size={14}
                  className="text-brand-primary shrink-0"
                />
                {t('admin.trust.moderation_link')}
              </span>
              <ExternalLink size={12} className="text-white/40 shrink-0" />
            </Link>
          )}

          {reportMttr && (
            <div className="border-t border-white/5 pt-2.5 flex items-start gap-2.5 min-h-11">
              <Clock size={14} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white">
                  {t('admin.trust.mttr_title')}
                </p>
                <p className="text-[11px] text-white/45 mt-0.5">
                  {t('admin.trust.mttr_subtitle', {
                    days: reportMttr.windowDays,
                  })}
                </p>
                {reportMttr.resolvedCount === 0 ||
                reportMttr.medianMs == null ? (
                  <p className="text-xs text-white/50 mt-1">
                    {t('admin.trust.mttr_empty', {
                      days: reportMttr.windowDays,
                    })}
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-bold text-emerald-400 tabular-nums mt-1">
                      {t('admin.trust.mttr_median', {
                        duration: formatMttrDuration(reportMttr.medianMs, t),
                      })}
                    </p>
                    <p className="text-[11px] text-white/45 mt-0.5">
                      {t('admin.trust.mttr_sample', {
                        count: reportMttr.resolvedCount,
                      })}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-2 sm:gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="border border-white/5 bg-white/2 p-2.5 rounded-lg"
            >
              <AdminListSkeleton rows={4} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-2 sm:gap-3">
          <TrustSection
            icon={Flag}
            title={t('admin.trust.reports_title')}
            count={counts.reports}
            link={adminTabPath('reports')}
            linkLabel={t('admin.trust.view_all_reports')}
            emptyTitle={t('admin.trust.reports_empty')}
            emptyDescription={t('admin.trust.section_empty_description')}
            isEmpty={reports.length === 0}
          >
            {reports.map((item: TrustQueueReport) => (
              <AdminListRow
                key={item.id}
                title={item.reason}
                subtitle={
                  item.assignedAdmin?.displayName || item.assignedAdmin?.email
                    ? `${item.targetType} · ${item.assignedAdmin.displayName || item.assignedAdmin.email}`
                    : item.targetType
                }
                meta={timeAgo(item.createdAt)}
                onClick={() => navigate(adminTabPath('reports'))}
                badge={
                  <span className="text-xs font-semibold uppercase text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">
                    {item.status}
                  </span>
                }
              />
            ))}
          </TrustSection>

          <TrustSection
            icon={Scale}
            title={t('admin.trust.appeals_title')}
            count={counts.appeals}
            link={adminTabPath('appeals')}
            linkLabel={t('admin.trust.view_all_appeals')}
            emptyTitle={t('admin.trust.appeals_empty')}
            emptyDescription={t('admin.trust.section_empty_description')}
            isEmpty={appeals.length === 0}
          >
            {appeals.map((item: TrustQueueAppeal) => (
              <AdminListRow
                key={item.id}
                title={item.user?.email || item.user?.profile?.username || '—'}
                subtitle={item.reason}
                meta={timeAgo(item.createdAt)}
                onClick={() => navigate(adminTabPath('appeals'))}
                badge={
                  <span className="text-xs font-semibold uppercase text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                    {item.targetType}
                  </span>
                }
              />
            ))}
          </TrustSection>

          <TrustSection
            icon={LifeBuoy}
            title={t('admin.trust.tickets_title')}
            count={counts.tickets}
            link={adminTabPath('support')}
            linkLabel={t('admin.trust.view_all_tickets')}
            emptyTitle={t('admin.trust.tickets_empty')}
            emptyDescription={t('admin.trust.section_empty_description')}
            isEmpty={tickets.length === 0}
          >
            {tickets.map((item: AdminSupportTicket) => (
              <AdminListRow
                key={item.id}
                title={item.subject}
                subtitle={item.email}
                meta={timeAgo(item.createdAt)}
                onClick={() => navigate(adminTabPath('support'))}
                badge={
                  <span className="text-xs font-semibold uppercase text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">
                    {item.status}
                  </span>
                }
              />
            ))}
          </TrustSection>
        </div>
      )}
    </div>
  );
}
