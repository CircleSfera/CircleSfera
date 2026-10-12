import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Activity, Download, Users, Zap } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminTransaction } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import { paymentsApi } from '../../services/payments.service';
import type { PaginatedResponse } from '../../types';
import { formatDay } from '../../utils/format';
import { formatCents } from '../../utils/money';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import {
  FilterDropdown,
  Pagination,
  SearchInput,
  StatusBadge,
} from './AdminTable';
import { adminToast } from './adminToast';
import { RecurringIncomeDays } from './RecurringIncomeDays';
import StatCard from './StatCard';

export default function MonetizationTab() {
  const { t, i18n } = useTranslation();
  const [txPage, setTxPage] = useState(1);
  const [txStatus, setTxStatus] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const debouncedTxSearch = useDebouncedValue(txSearch, 400);

  const {
    data: analytics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['adminMonetization'],
    queryFn: () => adminApi.getMonetizationAnalytics().then((res) => res.data),
  });

  const { data: txData, isLoading: txLoading } = useQuery<
    PaginatedResponse<AdminTransaction>
  >({
    queryKey: ['admin', 'transactions', txPage, txStatus, debouncedTxSearch],
    queryFn: () =>
      adminApi
        .getTransactions(
          txPage,
          20,
          txStatus || undefined,
          debouncedTxSearch || undefined,
        )
        .then((res) => res.data),
  });

  const handleExportLedger = async () => {
    try {
      const blob = await paymentsApi.getAdminLedger();
      const url = URL.createObjectURL(
        new Blob([blob as BlobPart], { type: 'text/csv' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'circlesfera-ledger.csv';
      a.click();
      URL.revokeObjectURL(url);
      adminToast(t('admin.monetization.toast_ledger_exported'), 'success');
    } catch {
      adminToast(t('admin.monetization.toast_ledger_error'), 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2.5">
        <AdminPageHeader
          title={t('admin.monetization.title')}
          subtitle={t('admin.monetization.subtitle')}
        />
        <div className="grid grid-cols-2 gap-2 sm:gap-3 animate-pulse">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-28 bg-white/5 rounded-xl border border-white/5"
            />
          ))}
        </div>
        <div className="h-64 bg-white/5 rounded-xl border border-white/5 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2.5">
        <AdminPageHeader
          title={t('admin.monetization.title')}
          subtitle={t('admin.monetization.subtitle')}
        />
        <AdminEmptyState
          icon={Activity}
          title={t('admin.monetization.error_title')}
          description={t('admin.monetization.error_description')}
          className="border border-red-500/20 bg-red-500/5"
        />
      </div>
    );
  }

  const distribution = analytics?.tierDistribution || {
    PREMIUM: 0,
    ELITE: 0,
    BUSINESS: 0,
  };
  const total =
    distribution.PREMIUM + distribution.ELITE + distribution.BUSINESS || 1;

  const tiers = [
    {
      label: t('admin.monetization.tier_verified'),
      count: distribution.PREMIUM,
      color: 'bg-blue-400',
    },
    {
      label: t('admin.monetization.tier_elite'),
      count: distribution.ELITE,
      color: 'bg-red-500',
    },
    {
      label: t('admin.monetization.tier_business'),
      count: distribution.BUSINESS,
      color: 'bg-yellow-400',
    },
  ];

  const formatAmount = (tx: AdminTransaction) =>
    formatCents(tx.amount, i18n.language, tx.currency);

  // The state and the kind of a transaction, in words.
  const TX_PILL: Record<string, string> = {
    COMPLETED: 'resolved',
    PENDING: 'pending',
    FAILED: 'banned',
    REFUNDED: 'dismissed',
  };
  const txStatusBadge = (status: AdminTransaction['status']) => {
    const stored = (status || '').toUpperCase();
    return (
      <StatusBadge
        status={TX_PILL[stored] ?? 'dismissed'}
        label={t(`admin.monetization.tx_status.${stored}`, {
          defaultValue: status,
        })}
      />
    );
  };
  const txKind = (tx: AdminTransaction) =>
    t(`admin.monetization.tx_type.${tx.type}`, { defaultValue: tx.type });
  // Who paid, and who was paid when the payment was to a person.
  const txParties = (tx: AdminTransaction) => {
    const from = tx.sender?.profile?.username
      ? `@${tx.sender.profile.username}`
      : tx.sender?.email || '—';
    const to = tx.receiver?.profile?.username;
    return to ? `${from} → @${to}` : from;
  };

  const transactions = txData?.data ?? [];

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.monetization.title')}
        subtitle={t('admin.monetization.subtitle')}
        actions={
          <Button
            onClick={handleExportLedger}
            variant="outline"
            className="text-sm font-semibold text-white/70 hover:text-white border-white/10 px-4 min-h-11 w-full sm:w-auto"
            aria-label={t('admin.monetization.export_ledger_aria')}
          >
            <Download size={16} className="mr-2" />
            {t('admin.monetization.export_ledger')}
          </Button>
        }
      />

      {/* SaaS Primary Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <StatCard
          label={t('admin.monetization.mrr_label')}
          value={analytics?.activeMRR || 0}
          // The same amount, written the same way, as on the Backoffice home.
          formatValue={(amount) =>
            formatCents(Math.round(amount * 100), i18n.language)
          }
          icon={Zap}
          color="blue"
        />
        {/* The growth is of new subscriptions: it is said here, once. */}
        <StatCard
          label={t('admin.monetization.subscriptions_label')}
          value={analytics?.totalSubscriptions || 0}
          icon={Users}
          color="purple"
          growth={analytics?.subscriptionGrowth}
          subtitle={t('admin.monetization.growth_period')}
        />
      </div>

      <RecurringIncomeDays />

      {/* The share by plan: lines of its section, no box inside a box. */}
      <section className="glass-panel rounded-lg p-2.5 sm:p-3">
        <h3 className="text-sm font-semibold text-white">
          {t('admin.monetization.tier_distribution_title')}
        </h3>
        <p className="text-white/50 text-xs">
          {t('admin.monetization.tier_distribution_subtitle')}
        </p>
        <div
          className="mt-3 h-2 w-full bg-white/5 rounded-full overflow-hidden flex gap-0.5"
          aria-hidden="true"
        >
          {tiers.map((tier) => (
            <motion.div
              key={tier.label}
              initial={{ width: 0 }}
              animate={{ width: `${(tier.count / total) * 100}%` }}
              className={`h-full rounded-full ${tier.color}`}
            />
          ))}
        </div>
        <ul className="mt-2 divide-y divide-white/5">
          {tiers.map((tier) => (
            <li
              key={tier.label}
              className="flex items-center justify-between gap-3 py-2 last:pb-0"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${tier.color}`}
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-white truncate">
                  {tier.label}
                </span>
                <span className="text-xs text-white/50 whitespace-nowrap">
                  {t('admin.monetization.tier_members', { count: tier.count })}
                </span>
              </span>
              <span className="text-sm font-semibold text-white tabular-nums shrink-0">
                {Math.round((tier.count / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-white">
            {t('admin.monetization.transactions_title')}
          </h3>
          <p className="text-xs text-white/50">
            {t('admin.monetization.transactions_subtitle')}
          </p>
        </div>

        <AdminFilterBar>
          <div className="flex-1 min-w-0">
            <SearchInput
              value={txSearch}
              onChange={(v) => {
                setTxSearch(v);
                setTxPage(1);
              }}
              placeholder={t('admin.monetization.transactions_search')}
            />
          </div>
          <FilterDropdown
            label={t('admin.shared.filter_status')}
            value={txStatus}
            onChange={(v) => {
              setTxStatus(v);
              setTxPage(1);
            }}
            options={[
              { value: '', label: t('admin.monetization.status_all') },
              ...['COMPLETED', 'PENDING', 'FAILED', 'REFUNDED'].map(
                (value) => ({
                  value,
                  label: t(`admin.monetization.tx_status.${value}`),
                }),
              ),
            ]}
          />
        </AdminFilterBar>

        {txLoading ? (
          <AdminListSkeleton />
        ) : transactions.length === 0 ? (
          <AdminEmptyState
            title={t('admin.monetization.transactions_empty_title')}
            description={t('admin.monetization.transactions_empty_description')}
          />
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <AdminListRow
                key={tx.id}
                title={`${formatAmount(tx)} · ${txKind(tx)}`}
                subtitle={txParties(tx)}
                meta={
                  <>
                    <span>{formatDay(tx.createdAt, i18n.language)}</span>
                    {tx.description && <span>{tx.description}</span>}
                  </>
                }
                badge={txStatusBadge(tx.status)}
              />
            ))}
          </div>
        )}
        <Pagination meta={txData?.meta} onPageChange={setTxPage} />
      </div>
    </div>
  );
}
