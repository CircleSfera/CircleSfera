import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
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
  type TrustQueueMttr,
  type TrustQueueReport,
} from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { formatWaiting } from '../../utils/format';
import { AdminEmptyState } from './AdminEmptyState';
import {
  ADMIN_PAGE_LIST_STATE,
  ADMIN_PAGE_ROW,
  AdminListRow,
} from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { StatusBadge } from './AdminTable';
import { ADMIN_TAB_PERMISSIONS, adminTabPath } from './adminNav';

function formatMttrDuration(
  ms: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) {
    return t('admin.trust.mttr_duration_minutes', { count: Math.max(1, mins) });
  }
  const hrs = Math.round(mins / 60);
  if (hrs < 24) {
    return t('admin.trust.mttr_duration_hours', { count: hrs });
  }
  const days = Math.round(hrs / 24);
  return t('admin.trust.mttr_duration_days', { count: days });
}

function TrustSection({
  icon: Icon,
  title,
  count,
  link,
  linkLabel,
  mttr,
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
  mttr?: TrustQueueMttr;
  emptyTitle: string;
  emptyDescription: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  // A queue is a heading and its cards: no box around them.
  return (
    <section aria-label={title} className="min-w-0 space-y-2">
      <div>
        <div className="flex flex-wrap items-center gap-x-2 min-h-11">
          <Icon size={16} className="text-brand-primary-text shrink-0" />
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary-text border border-brand-primary/30 tabular-nums">
            {count}
          </span>
          <Link
            to={link}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-primary-text hover:text-brand-primary-text/80 shrink-0 min-h-11"
          >
            {linkLabel}
            <ChevronRight size={14} aria-hidden />
          </Link>
        </div>
        {mttr && (
          <p className="text-xs text-white/50">
            {mttr.resolvedCount === 0 || mttr.medianMs == null
              ? t('admin.trust.mttr_empty', { days: mttr.windowDays })
              : t('admin.trust.mttr_median', {
                  duration: formatMttrDuration(mttr.medianMs, t),
                  count: mttr.resolvedCount,
                  days: mttr.windowDays,
                })}
          </p>
        )}
      </div>

      {isEmpty ? (
        <div className={ADMIN_PAGE_LIST_STATE}>
          <AdminEmptyState
            icon={Shield}
            title={emptyTitle}
            description={emptyDescription}
            compact
          />
        </div>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}

export default function TrustTab() {
  const { t, i18n } = useTranslation();
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
  const appealMttr = data?.appealMttr;
  const ticketMttr = data?.ticketMttr;
  const reports = data?.reports ?? [];
  const appeals = data?.appeals ?? [];
  const tickets = data?.tickets ?? [];
  const totalAttention = counts.reports + counts.appeals + counts.tickets;
  const targetName = (targetType: string) =>
    t(`admin.audit.targets.${targetType}`, { defaultValue: targetType });

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.trust.title')}
        subtitle={
          isLoading
            ? t('admin.trust.subtitle')
            : totalAttention > 0
              ? t('admin.trust.attention_title', { count: totalAttention })
              : t('admin.trust.attention_clear_title')
        }
        actions={
          canOpenModeration && (
            <Link
              to={adminTabPath('moderation')}
              className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl text-sm font-semibold text-white border border-white/12 hover:bg-white/6 transition-colors"
            >
              <ShieldAlert
                size={16}
                className="text-brand-primary-text shrink-0"
              />
              {t('admin.trust.moderation_link')}
            </Link>
          )
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`${ADMIN_PAGE_LIST_STATE} p-3`}>
              <AdminListSkeleton rows={4} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          <TrustSection
            icon={Flag}
            title={t('admin.trust.reports_title')}
            count={counts.reports}
            link={adminTabPath('reports')}
            linkLabel={t('admin.trust.view_all_reports')}
            emptyTitle={t('admin.trust.reports_empty')}
            emptyDescription={t('admin.trust.section_empty_description')}
            mttr={reportMttr}
            isEmpty={reports.length === 0}
          >
            {reports.map((item: TrustQueueReport) => (
              <AdminListRow
                key={item.id}
                className={ADMIN_PAGE_ROW}
                title={t(`admin.reports.reasons.${item.reason}`, {
                  defaultValue: item.reason,
                })}
                subtitle={
                  item.assignedAdmin?.displayName || item.assignedAdmin?.email
                    ? `${targetName(item.targetType)} · ${item.assignedAdmin.displayName || item.assignedAdmin.email}`
                    : targetName(item.targetType)
                }
                meta={formatWaiting(item.createdAt, i18n.language, t)}
                onClick={() => navigate(adminTabPath('reports'))}
                badge={
                  <StatusBadge
                    status={item.status}
                    label={t(`admin.reports.badge.${item.status}`, {
                      defaultValue: item.status,
                    })}
                  />
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
            mttr={appealMttr}
            isEmpty={appeals.length === 0}
          >
            {appeals.map((item: TrustQueueAppeal) => (
              <AdminListRow
                key={item.id}
                className={ADMIN_PAGE_ROW}
                title={item.user?.email || item.user?.profile?.username || '—'}
                // What is appealed, then what the person says.
                subtitle={`${targetName(item.targetType)} · ${item.reason}`}
                meta={formatWaiting(item.createdAt, i18n.language, t)}
                onClick={() => navigate(adminTabPath('appeals'))}
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
            mttr={ticketMttr}
            isEmpty={tickets.length === 0}
          >
            {tickets.map((item: AdminSupportTicket) => (
              <AdminListRow
                key={item.id}
                className={ADMIN_PAGE_ROW}
                title={item.subject}
                subtitle={item.email}
                meta={formatWaiting(item.createdAt, i18n.language, t)}
                onClick={() => navigate(adminTabPath('support'))}
                badge={
                  <StatusBadge
                    status={item.status}
                    label={t(`admin.support.badge.${item.status}`, {
                      defaultValue: item.status,
                    })}
                  />
                }
              />
            ))}
          </TrustSection>
        </div>
      )}
    </div>
  );
}
