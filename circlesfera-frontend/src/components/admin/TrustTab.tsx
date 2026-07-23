import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Flag, LifeBuoy, Scale, Shield } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  type AdminSupportTicket,
  adminApi,
  type TrustQueueAppeal,
  type TrustQueueReport,
} from '../../services/admin.service';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';

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
    <div className="border border-white/5 bg-white/[0.02] flex flex-col min-h-[320px]">
      <div className="p-3 border-b border-white/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={16} className="text-brand-primary shrink-0" />
          <h3 className="text-sm font-semibold text-white truncate">{title}</h3>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
            {count}
          </span>
        </div>
        <Link
          to={link}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-primary/80 shrink-0"
        >
          {linkLabel}
          <ExternalLink size={12} />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
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

export default function TrustTab() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'trust-queue'],
    queryFn: () => adminApi.getTrustQueue().then((r) => r.data),
    refetchInterval: 60_000,
  });

  const counts = data?.counts ?? { reports: 0, appeals: 0, tickets: 0 };
  const reports = data?.reports ?? [];
  const appeals = data?.appeals ?? [];
  const tickets = data?.tickets ?? [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.trust.title')}
        subtitle={t('admin.trust.subtitle')}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-white/5 bg-white/[0.02] p-3">
              <AdminListSkeleton rows={4} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <TrustSection
            icon={Flag}
            title={t('admin.trust.reports_title')}
            count={counts.reports}
            link="/admin/reports"
            linkLabel={t('admin.trust.view_all_reports')}
            emptyTitle={t('admin.trust.reports_empty')}
            emptyDescription={t('admin.trust.section_empty_description')}
            isEmpty={reports.length === 0}
          >
            {reports.map((item: TrustQueueReport) => (
              <AdminListRow
                key={item.id}
                title={item.reason}
                subtitle={item.targetType}
                meta={timeAgo(item.createdAt)}
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
            link="/admin/appeals"
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
            link="/admin/support"
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
