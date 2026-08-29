import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity,
  Download,
  PieChart,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminTransaction } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import { paymentsApi } from '../../services/payments.service';
import type { PaginatedResponse } from '../../types';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { FilterDropdown, Pagination, SearchInput, Table } from './AdminTable';
import { adminToast } from './adminToast';
import StatCard from './StatCard';

export default function MonetizationTab() {
  const { t } = useTranslation();
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
        <div className="grid grid-cols-2 gap-2 sm:gap-3 animate-pulse">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-24 bg-white/5 rounded-xl border border-white/5"
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

  const formatAmount = (tx: AdminTransaction) =>
    `${(tx.amount / 100).toFixed(2)} ${tx.currency}`;

  const txStatusBadge = (status: AdminTransaction['status']) => {
    const normalized = (status || '').toUpperCase();
    const styles: Record<string, string> = {
      COMPLETED: 'text-green-400 bg-green-400/10 border border-green-400/20',
      PENDING: 'text-yellow-400 bg-yellow-400/10 border border-yellow-400/20',
      FAILED: 'text-red-400 bg-red-400/10 border border-red-400/20',
      REFUNDED: 'text-purple-400 bg-purple-400/10 border border-purple-400/20',
    };
    const badgeStyle =
      styles[normalized] || 'text-white/50 bg-white/10 border border-white/20';
    return (
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${badgeStyle}`}
      >
        {status}
      </span>
    );
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
          icon={Zap}
          color="blue"
          growth={analytics?.subscriptionGrowth}
        />
        <StatCard
          label={t('admin.monetization.subscriptions_label')}
          value={analytics?.totalSubscriptions || 0}
          icon={Users}
          color="purple"
        />
      </div>

      {/* Stripe Integration Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        <div className="p-2.5 sm:p-3 rounded-lg border border-white/5 bg-white/2 flex flex-col justify-between gap-2">
          <div className="flex justify-between items-start gap-2">
            <div className="w-8 h-8 rounded-md bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0">
              <Zap size={16} />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
              {t('admin.monetization.stripe_connected')}
            </span>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-0.5">
              {t('admin.monetization.stripe_api_title')}
            </h4>
            <p className="text-white/50 text-xs leading-snug line-clamp-2">
              {t('admin.monetization.stripe_api_desc')}
            </p>
          </div>
        </div>

        <div className="p-2.5 sm:p-3 rounded-lg border border-white/5 bg-white/2 flex flex-col justify-between gap-2">
          <div className="flex justify-between items-start gap-2">
            <div className="w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
              <Users size={16} />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
              {t('admin.monetization.stripe_connect_status')}
            </span>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-0.5">
              {t('admin.monetization.stripe_connect_title')}
            </h4>
            <p className="text-white/50 text-xs leading-snug line-clamp-2">
              {t('admin.monetization.stripe_connect_desc')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3">
        {/* Tier Distribution Chart (Linear) */}
        <div className="rounded-lg border border-white/5 bg-white/2 p-2.5 sm:p-3">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-md bg-brand-secondary/10 flex items-center justify-center border border-brand-secondary/20 shrink-0">
              <PieChart size={16} className="text-brand-secondary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">
                {t('admin.monetization.tier_distribution_title')}
              </h3>
              <p className="text-white/50 text-xs">
                {t('admin.monetization.tier_distribution_subtitle')}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
                  {t('admin.monetization.tier_composition')}
                </span>
                <span className="text-[10px] font-semibold text-white">
                  {t('admin.monetization.tier_active_base')}
                </span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden flex border border-white/5 p-0.5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(distribution.PREMIUM / total) * 100}%`,
                  }}
                  className="h-full bg-blue-400 rounded-full"
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(distribution.ELITE / total) * 100}%` }}
                  className="h-full bg-red-500 rounded-full ml-0.5"
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(distribution.BUSINESS / total) * 100}%`,
                  }}
                  className="h-full bg-yellow-400 rounded-full ml-0.5"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              {[
                {
                  label: t('admin.monetization.tier_verified'),
                  count: distribution.PREMIUM,
                  color: 'bg-blue-400',
                  percent: Math.round((distribution.PREMIUM / total) * 100),
                },
                {
                  label: t('admin.monetization.tier_elite'),
                  count: distribution.ELITE,
                  color: 'bg-red-500',
                  percent: Math.round((distribution.ELITE / total) * 100),
                },
                {
                  label: t('admin.monetization.tier_business'),
                  count: distribution.BUSINESS,
                  color: 'bg-yellow-400',
                  percent: Math.round((distribution.BUSINESS / total) * 100),
                },
              ].map((tier) => (
                <div
                  key={tier.label}
                  className="flex items-center justify-between p-2 bg-white/2 rounded-lg border border-white/5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${tier.color}`}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-white truncate">
                        {tier.label}
                      </span>
                      <span className="text-[10px] text-white/50">
                        {t('admin.monetization.tier_members', {
                          count: tier.count,
                        })}
                      </span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-white tabular-nums shrink-0 ml-2">
                    {tier.percent}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:gap-3">
          <div className="rounded-lg border border-white/5 bg-white/2 p-2.5 sm:p-3 flex flex-col justify-center">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-md bg-brand-primary/10 flex items-center justify-center shrink-0">
                <TrendingUp size={16} className="text-brand-primary" />
              </div>
              <h4 className="text-sm font-semibold text-white">
                {t('admin.monetization.growth_title')}
              </h4>
            </div>
            <p className="text-white/50 text-xs leading-snug mb-2 line-clamp-2">
              {t('admin.monetization.growth_description')}
            </p>
            <p className="text-2xl sm:text-3xl font-semibold text-white tabular-nums leading-tight">
              {analytics?.subscriptionGrowth !== undefined
                ? `${analytics.subscriptionGrowth > 0 ? '+' : ''}${analytics.subscriptionGrowth}%`
                : '—'}
            </p>
            <p className="text-[10px] text-white/40 mt-0.5">
              {t('admin.monetization.growth_period')}
            </p>
          </div>
        </div>
      </div>

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
              { value: '', label: t('admin.shared.all') },
              { value: 'COMPLETED', label: 'COMPLETED' },
              { value: 'PENDING', label: 'PENDING' },
              { value: 'FAILED', label: 'FAILED' },
              { value: 'REFUNDED', label: 'REFUNDED' },
            ]}
          />
        </AdminFilterBar>

        <AdminList
          loading={txLoading}
          isEmpty={!transactions.length}
          emptyTitle={t('admin.monetization.transactions_empty_title')}
          emptyDescription={t(
            'admin.monetization.transactions_empty_description',
          )}
          mobile={
            <div className="space-y-2">
              {transactions.map((tx) => (
                <AdminListRow
                  key={tx.id}
                  title={tx.description || tx.type}
                  subtitle={
                    tx.sender?.profile?.username
                      ? `@${tx.sender?.profile?.username} → @${tx.receiver?.profile?.username || '—'}`
                      : tx.sender?.email || '—'
                  }
                  badge={txStatusBadge(tx.status)}
                  meta={new Date(tx.createdAt).toLocaleString()}
                  primaryAction={
                    <span className="text-sm font-semibold text-white tabular-nums">
                      {formatAmount(tx)}
                    </span>
                  }
                />
              ))}
            </div>
          }
          desktop={
            <Table
              headers={[
                t('admin.monetization.col_date'),
                t('admin.monetization.col_type'),
                t('admin.monetization.col_parties'),
                t('admin.monetization.col_amount'),
                t('admin.monetization.col_status'),
              ]}
              columnWidths={[
                'hidden lg:table-cell w-[8rem]',
                'w-[5rem]',
                'min-w-[10rem]',
                'w-[5.5rem]',
                'w-[5.5rem]',
              ]}
              loading={false}
              isEmpty={false}
            >
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="px-2 py-1 text-white/40 text-sm whitespace-nowrap hidden lg:table-cell">
                    {new Date(tx.createdAt).toLocaleString()}
                  </td>
                  <td className="px-2 py-1">
                    <span className="text-xs font-semibold uppercase text-white/70">
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <span className="text-sm text-white/70 truncate block max-w-56">
                      {tx.sender?.profile?.username
                        ? `@${tx.sender?.profile?.username} → @${tx.receiver?.profile?.username || '—'}`
                        : tx.description || '—'}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-white text-sm font-semibold tabular-nums">
                    {formatAmount(tx)}
                  </td>
                  <td className="px-2 py-1">{txStatusBadge(tx.status)}</td>
                </tr>
              ))}
            </Table>
          }
        />
        <Pagination meta={txData?.meta} onPageChange={setTxPage} />
      </div>
    </div>
  );
}
