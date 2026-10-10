import { useQuery } from '@tanstack/react-query';
import { CreditCard, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { type AdminSubscription, adminApi } from '../../services/admin.service';
import { formatDate } from '../../utils/format';
import { formatCents } from '../../utils/money';
import { UserAvatar } from '../index';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { FilterDropdown, Pagination, SearchInput } from './AdminTable';

const STATUSES = [
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
  'INCOMPLETE',
  'CANCELLED',
  'EXPIRED',
] as const;

const STATUS_COLORS: Record<AdminSubscription['status'], string> = {
  ACTIVE: 'text-green-400 bg-green-400/10 border-green-400/20',
  TRIALING: 'text-green-400 bg-green-400/10 border-green-400/20',
  PAST_DUE: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  INCOMPLETE: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  CANCELLED: 'text-white/60 bg-white/10 border-white/20',
  EXPIRED: 'text-white/60 bg-white/10 border-white/20',
};

const IN_FORCE: ReadonlySet<AdminSubscription['status']> = new Set([
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
]);

/**
 * Platform plan subscriptions: who has which plan and in what state. Read
 * only; each row links to the payment provider, where a subscription is
 * changed, cancelled or refunded.
 */
export default function SubscriptionsTab() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [status, setStatus] = useState('');
  const [planId, setPlanId] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'subscriptions', page, debouncedSearch, status, planId],
    queryFn: () =>
      adminApi
        .getSubscriptions({
          page,
          limit: 20,
          search: debouncedSearch || undefined,
          status: status || undefined,
          planId: planId || undefined,
        })
        .then((res) => res.data),
  });

  // The plan filter needs the catalogue, which has its own permission.
  const { data: catalogue } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => adminApi.getPlans().then((res) => res.data),
    retry: false,
  });

  const firstPage = () => setPage(1);

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.subscriptions.title')}
        subtitle={t('admin.subscriptions.subtitle')}
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              firstPage();
            }}
            placeholder={t('admin.subscriptions.search_placeholder')}
          />
        </div>
        <div className="sm:w-52">
          <FilterDropdown
            label={t('admin.subscriptions.filter_status')}
            value={status}
            onChange={(value) => {
              setStatus(value);
              firstPage();
            }}
            options={[
              { label: t('admin.subscriptions.all_statuses'), value: '' },
              ...STATUSES.map((value) => ({
                label: t(`admin.subscriptions.status.${value}`),
                value,
              })),
            ]}
          />
        </div>
        {catalogue && catalogue.plans.length > 0 && (
          <div className="sm:w-52">
            <FilterDropdown
              label={t('admin.subscriptions.filter_plan')}
              value={planId}
              onChange={(value) => {
                setPlanId(value);
                firstPage();
              }}
              options={[
                { label: t('admin.subscriptions.all_plans'), value: '' },
                ...catalogue.plans.map((plan) => ({
                  label: plan.name,
                  value: plan.id,
                })),
              ]}
            />
          </div>
        )}
      </AdminFilterBar>

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        {isLoading ? (
          <AdminListSkeleton rows={8} />
        ) : isError || !data ? (
          <AdminEmptyState
            icon={CreditCard}
            title={t('admin.subscriptions.load_failed')}
          />
        ) : data.data.length === 0 ? (
          <AdminEmptyState
            icon={CreditCard}
            title={t('admin.subscriptions.empty_title')}
            description={t('admin.subscriptions.empty_description')}
          />
        ) : (
          <div className="divide-y divide-white/10">
            {data.data.map((subscription) => {
              const holder =
                subscription.profile?.fullName ||
                subscription.user?.email ||
                t('admin.subscriptions.account_deleted');
              const ending =
                subscription.cancelAtPeriodEnd &&
                IN_FORCE.has(subscription.status);
              const date = formatDate(
                subscription.currentPeriodEnd,
                i18n.language,
              );

              return (
                <AdminListRow
                  key={subscription.id}
                  title={holder}
                  subtitle={
                    subscription.profile
                      ? `@${subscription.profile.username}`
                      : (subscription.user?.email ?? '')
                  }
                  avatar={
                    <UserAvatar
                      src={subscription.profile?.avatar}
                      alt={holder}
                      size="md"
                    />
                  }
                  badge={
                    <div
                      className={`px-2.5 py-1 rounded-full border text-xs font-bold ${STATUS_COLORS[subscription.status]}`}
                    >
                      {t(`admin.subscriptions.status.${subscription.status}`)}
                    </div>
                  }
                  meta={
                    <>
                      <span className="font-semibold text-white">
                        {subscription.plan.name} ·{' '}
                        {formatCents(
                          subscription.plan.priceCents,
                          i18n.language,
                          subscription.plan.currency,
                        )}
                      </span>
                      <span
                        className={ending ? 'text-yellow-400' : 'text-white/60'}
                      >
                        {t(
                          ending
                            ? 'admin.subscriptions.ends_on'
                            : IN_FORCE.has(subscription.status)
                              ? 'admin.subscriptions.renews_on'
                              : 'admin.subscriptions.period_ended_on',
                          { date },
                        )}
                      </span>
                    </>
                  }
                  primaryAction={
                    <a
                      href={`https://dashboard.stripe.com/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="-ml-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    >
                      {t('admin.subscriptions.open_in_stripe')}
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
