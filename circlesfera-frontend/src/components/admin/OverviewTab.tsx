import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronRight,
  CreditCard,
  LifeBuoy,
  type LucideIcon,
  Megaphone,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { adminApi } from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { formatNumber } from '../../utils/format';
import { formatCents } from '../../utils/money';
import { AdminPageHeader } from './AdminPageHeader';
import { ADMIN_TAB_PERMISSIONS, type AdminTab, adminTabPath } from './adminNav';

/** The total of a paginated staff list, asked for with a page of one row. */
const totalOf = (res: { data: { meta?: { total?: number } } }) =>
  res.data.meta?.total ?? 0;

function Figure({
  to,
  icon: Icon,
  label,
  value,
  hint,
  week,
  attention = false,
}: {
  to: AdminTab;
  icon: LucideIcon;
  label: string;
  value: string | undefined;
  hint?: string;
  // What came in this week against the week before.
  week?: { current: number; previous: number };
  attention?: boolean;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Link
      to={adminTabPath(to)}
      className="glass-panel group flex min-h-20 flex-col justify-between gap-1.5 rounded-lg p-3 transition-colors hover:bg-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
    >
      <span className="flex items-center justify-between gap-2 text-sm font-medium text-white/70">
        <span className="flex min-w-0 items-start gap-2">
          <Icon
            size={16}
            aria-hidden="true"
            className={`mt-0.5 shrink-0 ${attention ? 'text-amber-400' : 'text-brand-primary-text'}`}
          />
          {/* A long name takes the lines it needs: it is not cut. */}
          <span className="leading-tight">{label}</span>
        </span>
        <ChevronRight
          size={16}
          aria-hidden="true"
          className="shrink-0 text-white/50 group-hover:text-white"
        />
      </span>
      <span>
        <span
          className={`block text-xl font-bold tabular-nums leading-tight ${attention ? 'text-amber-400' : 'text-white'}`}
        >
          {value ?? '—'}
        </span>
        {hint && <span className="block text-xs text-white/60">{hint}</span>}
        {week && (
          <span className="block text-xs text-white/60">
            {t('backoffice.overview.week', {
              current: formatNumber(week.current, i18n.language),
              previous: formatNumber(week.previous, i18n.language),
            })}
          </span>
        )}
      </span>
    </Link>
  );
}

/**
 * The home of the Backoffice: the figures looked at daily, each one a link to
 * the section behind it. A figure shows only with the permission of its
 * section, and is asked for only then.
 */
export default function OverviewTab() {
  const { t, i18n } = useTranslation();
  const hasPermission = useAdminAuthStore((state) => state.hasPermission);
  const payments = hasPermission(ADMIN_TAB_PERMISSIONS.subscriptions);
  const support = hasPermission(ADMIN_TAB_PERMISSIONS.support);
  const promotions = hasPermission(ADMIN_TAB_PERMISSIONS.promotions);

  const { data: money } = useQuery({
    queryKey: ['admin', 'overview', 'monetization'],
    queryFn: () => adminApi.getMonetizationAnalytics().then((res) => res.data),
    enabled: payments,
  });
  // Each part is asked for only with the permission of its section.
  const weekOf = (
    part: 'payments' | 'support' | 'promotions',
    enabled: boolean,
  ) => ({
    queryKey: ['admin', 'overview', 'week', part],
    queryFn: () => adminApi.getOverviewWeek(part).then((res) => res.data),
    enabled,
  });
  const { data: paymentsWeek } = useQuery(weekOf('payments', payments));
  const { data: supportWeek } = useQuery(weekOf('support', support));
  const { data: promotionsWeek } = useQuery(weekOf('promotions', promotions));
  const week = { ...paymentsWeek, ...supportWeek, ...promotionsWeek };
  const { data: payouts } = useQuery({
    queryKey: ['admin', 'payouts', 'stats'],
    queryFn: () => adminApi.getPayoutStats().then((res) => res.data),
    enabled: payments,
  });
  const { data: openDisputes } = useQuery({
    queryKey: ['admin', 'overview', 'disputes'],
    queryFn: () =>
      adminApi
        .getDisputes({ page: 1, limit: 1, state: 'open' })
        .then((res) => res.data.meta.openCount),
    enabled: payments,
  });
  const { data: openTickets } = useQuery({
    queryKey: ['admin', 'overview', 'tickets', 'OPEN'],
    queryFn: () => adminApi.getSupportTickets(1, 1, 'OPEN').then(totalOf),
    enabled: support,
  });
  const { data: pastTarget } = useQuery({
    queryKey: ['admin', 'overview', 'tickets', 'past-target'],
    queryFn: () =>
      adminApi
        .getSupportTickets(1, 1, undefined, undefined, { target: 'past' })
        .then(totalOf),
    enabled: support,
  });
  const { data: withModeration } = useQuery({
    queryKey: ['admin', 'overview', 'tickets', 'ESCALATED'],
    queryFn: () => adminApi.getSupportTickets(1, 1, 'ESCALATED').then(totalOf),
    enabled: support,
  });
  const { data: pendingPromotions } = useQuery({
    queryKey: ['admin', 'overview', 'promotions', 'PENDING'],
    queryFn: () => adminApi.getPromotions(1, 1, 'PENDING').then(totalOf),
    enabled: promotions,
  });

  const count = (value: number | undefined) =>
    value === undefined ? undefined : formatNumber(value, i18n.language);
  const tiers = money?.tierDistribution;

  const failedPayouts = !!payouts && payouts.failed > 0;
  const queues = [
    payments && {
      waits: !!openDisputes && openDisputes > 0,
      figure: (
        <Figure
          key="disputes"
          to="disputes"
          week={week.disputes}
          icon={ShieldAlert}
          label={t('backoffice.overview.open_disputes')}
          value={count(openDisputes)}
          hint={t('backoffice.overview.open_disputes_hint')}
          attention={!!openDisputes && openDisputes > 0}
        />
      ),
    },
    payments && {
      waits: failedPayouts,
      figure: (
        <Figure
          key="payouts"
          to="payouts"
          icon={AlertCircle}
          label={t('backoffice.overview.failed_payouts')}
          value={count(payouts?.failed)}
          hint={
            payouts &&
            t('backoffice.overview.pending_payouts', {
              count: payouts.pending,
            })
          }
          attention={failedPayouts}
        />
      ),
    },
    support && {
      waits: !!openTickets && openTickets > 0,
      figure: (
        <Figure
          key="support"
          to="support"
          week={week.tickets}
          icon={LifeBuoy}
          label={t('backoffice.overview.open_tickets')}
          value={count(openTickets)}
          hint={
            withModeration === undefined && pastTarget === undefined
              ? undefined
              : [
                  pastTarget === undefined
                    ? null
                    : t('backoffice.overview.tickets_past_target', {
                        count: pastTarget,
                      }),
                  withModeration === undefined
                    ? null
                    : t('backoffice.overview.tickets_with_moderation', {
                        count: withModeration,
                      }),
                ]
                  .filter(Boolean)
                  .join(' · ')
          }
          attention={!!openTickets && openTickets > 0}
        />
      ),
    },
    promotions && {
      waits: !!pendingPromotions && pendingPromotions > 0,
      figure: (
        <Figure
          key="promotions"
          to="promotions"
          week={week.promotions}
          icon={Megaphone}
          label={t('backoffice.overview.pending_promotions')}
          value={count(pendingPromotions)}
          attention={!!pendingPromotions && pendingPromotions > 0}
        />
      ),
    },
  ]
    .filter((queue) => !!queue)
    // The ones that wait first; the order among them is the one above.
    .sort((a, b) => Number(b.waits) - Number(a.waits));

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('backoffice.overview.title')}
        subtitle={t('backoffice.overview.subtitle')}
      />

      {/* What waits for someone comes first, the ones that wait before the
          ones that are calm; then how the business stands. */}
      {queues.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-white">
            {t('backoffice.overview.queues_title')}
          </h2>
          <div className="grid gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {queues.map((queue) => queue.figure)}
          </div>
        </section>
      )}
      {payments && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-white">
            {t('backoffice.overview.business_title')}
          </h2>
          <div className="grid gap-2 sm:gap-3 sm:grid-cols-2">
            <Figure
              to="subscriptions"
              week={week.subscriptions}
              icon={CreditCard}
              label={t('backoffice.overview.subscriptions')}
              value={count(money?.totalSubscriptions)}
              hint={
                tiers &&
                t('backoffice.overview.subscriptions_by_plan', {
                  premium: tiers.PREMIUM,
                  elite: tiers.ELITE,
                  business: tiers.BUSINESS,
                })
              }
            />
            <Figure
              to="monetization"
              icon={TrendingUp}
              label={t('backoffice.overview.recurring_revenue')}
              value={
                money &&
                formatCents(Math.round(money.activeMRR * 100), i18n.language)
              }
              hint={t('backoffice.overview.recurring_revenue_hint')}
            />
          </div>
        </section>
      )}
    </div>
  );
}
