import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type AdminDispute, adminApi } from '../../services/admin.service';
import { formatDate } from '../../utils/format';
import { formatCents } from '../../utils/money';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminSegmentedControl } from './AdminSegmentedControl';
import { AdminListSkeleton } from './AdminSkeletons';
import { Pagination } from './AdminTable';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days until the evidence is due; negative once the day has passed. */
function daysLeft(dispute: AdminDispute, now: number): number | null {
  if (!dispute.evidenceDueBy) return null;
  return Math.ceil((new Date(dispute.evidenceDueBy).getTime() - now) / DAY_MS);
}

function statusColor(dispute: AdminDispute): string {
  if (dispute.status === 'won')
    return 'text-green-400 bg-green-400/10 border-green-400/20';
  if (dispute.closedAt) return 'text-white/60 bg-white/10 border-white/20';
  return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
}

/**
 * Disputes opened at the payment provider. Read only: the row says what is
 * disputed, why, in what state and when the answer is due, and links to the
 * provider, where the dispute is answered.
 */
export default function DisputesTab() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [state, setState] = useState<'open' | 'closed' | 'all'>('open');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'disputes', page, state],
    queryFn: () =>
      adminApi
        .getDisputes({
          page,
          limit: 20,
          state: state === 'all' ? undefined : state,
        })
        .then((res) => res.data),
  });

  const now = Date.now();

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.disputes.title')}
        subtitle={t('admin.disputes.subtitle')}
      />

      <AdminFilterBar>
        <AdminSegmentedControl
          value={state}
          onChange={(value) => {
            setState(value as typeof state);
            setPage(1);
          }}
          options={[
            { value: 'open', label: t('admin.disputes.filter_open') },
            { value: 'closed', label: t('admin.disputes.filter_closed') },
            { value: 'all', label: t('admin.disputes.filter_all') },
          ]}
        />
      </AdminFilterBar>

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        {isLoading ? (
          <AdminListSkeleton rows={6} />
        ) : isError || !data ? (
          <AdminEmptyState
            icon={ShieldAlert}
            title={t('admin.disputes.load_failed')}
          />
        ) : data.data.length === 0 ? (
          <AdminEmptyState
            icon={ShieldAlert}
            title={t(
              state === 'open'
                ? 'admin.disputes.empty_open_title'
                : 'admin.disputes.empty_title',
            )}
            description={t('admin.disputes.empty_description')}
          />
        ) : (
          <div className="divide-y divide-white/10">
            {data.data.map((dispute) => {
              const left = daysLeft(dispute, now);
              const urgent = left !== null && left <= 3;

              return (
                <AdminListRow
                  key={dispute.id}
                  title={formatCents(
                    dispute.amountCents,
                    i18n.language,
                    dispute.currency,
                  )}
                  subtitle={
                    dispute.transaction?.sender?.email ??
                    t('admin.disputes.no_transaction')
                  }
                  badge={
                    <div
                      className={`px-2.5 py-1 rounded-full border text-xs font-bold ${statusColor(dispute)}`}
                    >
                      {t(`admin.disputes.status.${dispute.status}`, {
                        defaultValue: dispute.status,
                      })}
                    </div>
                  }
                  meta={
                    <>
                      <span className="text-white/80">
                        {t(`admin.disputes.reason.${dispute.reason}`, {
                          defaultValue: dispute.reason,
                        })}
                      </span>
                      <span className="text-white/60">
                        {t('admin.disputes.opened_on', {
                          date: formatDate(dispute.openedAt, i18n.language),
                        })}
                      </span>
                      {left !== null && dispute.evidenceDueBy && (
                        <span
                          className={
                            urgent
                              ? 'font-semibold text-yellow-400'
                              : 'text-white/60'
                          }
                        >
                          {left < 0
                            ? t('admin.disputes.due_passed', {
                                date: formatDate(
                                  dispute.evidenceDueBy,
                                  i18n.language,
                                ),
                              })
                            : t('admin.disputes.due_in', {
                                count: left,
                                date: formatDate(
                                  dispute.evidenceDueBy,
                                  i18n.language,
                                ),
                              })}
                        </span>
                      )}
                    </>
                  }
                  primaryAction={
                    <a
                      href={`https://dashboard.stripe.com/disputes/${encodeURIComponent(dispute.stripeDisputeId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="-ml-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    >
                      {t(
                        dispute.closedAt
                          ? 'admin.disputes.open_in_stripe'
                          : 'admin.disputes.answer_in_stripe',
                      )}
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {data && data.data.length > 0 && (
        <Pagination meta={data.meta} onPageChange={setPage} />
      )}
    </div>
  );
}
