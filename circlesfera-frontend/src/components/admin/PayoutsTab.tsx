import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock, DollarSign } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminStripePayoutLog } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { UserAvatar } from '../index';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { FilterDropdown, Pagination, SearchInput } from './AdminTable';
import StatCard from './StatCard';

const STATUS_ICONS: Record<string, React.ElementType> = {
  paid: CheckCircle2,
  pending: Clock,
  failed: AlertCircle,
  canceled: AlertCircle,
};

const STATUS_COLORS: Record<string, string> = {
  paid: 'text-green-400 bg-green-400/10 border-green-400/20',
  pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  failed: 'text-red-400 bg-red-400/10 border-red-400/20',
  canceled: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
};

export default function PayoutsTab() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const debouncedSearch = useDebouncedValue(searchQuery, 400);

  const [statusFilter, setStatusFilter] = useState('');

  const page = Number(searchParams.get('page')) || 1;
  const limit = 20;

  const { data, isLoading } = useQuery<PaginatedResponse<AdminStripePayoutLog>>(
    {
      queryKey: ['admin', 'payouts', page, debouncedSearch, statusFilter],
      queryFn: () =>
        adminApi
          .getPayouts(page, limit, statusFilter || undefined, debouncedSearch)
          .then((res) => res.data),
    },
  );

  const { data: statsData } = useQuery({
    queryKey: ['admin', 'payouts', 'stats'],
    queryFn: () => adminApi.getPayoutStats().then((res) => res.data),
  });

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const prevQ = prev.get('q') || '';
        if (prevQ !== debouncedSearch) {
          if (debouncedSearch) prev.set('q', debouncedSearch);
          else prev.delete('q');
          prev.set('page', '1');
          return prev;
        }
        return prev;
      },
      { replace: true },
    );
  }, [debouncedSearch, setSearchParams]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.payouts.title', 'Retiros (Stripe)')}
        subtitle={t(
          'admin.payouts.description',
          'Auditoría de los retiros automáticos gestionados por Stripe Connect.',
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        <StatCard
          label={t('admin.payouts.kpi_paid')}
          value={statsData?.paid || 0}
          icon={CheckCircle2}
          color="green"
        />
        <StatCard
          label={t('admin.payouts.kpi_pending')}
          value={statsData?.pending || 0}
          icon={Clock}
          color="yellow"
        />
        <StatCard
          label={t('admin.payouts.kpi_failed')}
          value={statsData?.failed || 0}
          icon={AlertCircle}
          color="red"
        />
      </div>

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder={t('admin.payouts.search_placeholder')}
          />
        </div>
        <FilterDropdown
          label={t('admin.payouts.filter_status')}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setSearchParams((prev) => {
              prev.set('page', '1');
              return prev;
            });
          }}
          options={[
            { label: t('admin.payouts.filter_all'), value: '' },
            { label: t('admin.payouts.kpi_paid'), value: 'paid' },
            { label: t('admin.payouts.kpi_pending'), value: 'pending' },
            {
              label: t('admin.payouts.filter_failed_cancelled'),
              value: 'failed',
            },
          ]}
        />
      </AdminFilterBar>

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        {isLoading ? (
          <AdminListSkeleton rows={10} />
        ) : data?.data.length === 0 ? (
          <AdminEmptyState
            icon={DollarSign}
            title={t('admin.payouts.empty_title')}
            description={t('admin.payouts.empty_description')}
          />
        ) : (
          <div className="divide-y divide-white/10">
            {data?.data.map((payout) => {
              const StatusIcon = STATUS_ICONS[payout.status] || Clock;
              const statusColor =
                STATUS_COLORS[payout.status] || STATUS_COLORS.canceled;

              return (
                <AdminListRow
                  key={payout.id}
                  title={payout.user.profile?.fullName || payout.user.email}
                  subtitle={`@${payout.user.profile?.username || 'user'}`}
                  avatar={
                    <UserAvatar
                      src={payout.user.profile?.avatar}
                      alt={payout.user.profile?.fullName || ''}
                      size="md"
                    />
                  }
                  badge={
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] uppercase font-bold tracking-wider ${statusColor}`}
                    >
                      <StatusIcon size={12} />
                      {payout.status}
                    </div>
                  }
                  meta={
                    <div className="text-right">
                      <div className="text-white font-semibold">
                        {(payout.amountCents / 100).toLocaleString('en-US', {
                          style: 'currency',
                          currency: payout.currency.toUpperCase(),
                        })}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(payout.arrivalDate).toLocaleDateString()}
                      </div>
                    </div>
                  }
                  primaryAction={
                    payout.failureReason ? (
                      <div
                        className="text-xs text-red-400 max-w-37.5 truncate"
                        title={payout.failureReason}
                      >
                        {payout.failureReason}
                      </div>
                    ) : null
                  }
                />
              );
            })}
          </div>
        )}

        {(data?.meta?.totalPages ?? 0) > 1 && (
          <Pagination
            meta={data!.meta!}
            onPageChange={(p) =>
              setSearchParams((prev) => {
                prev.set('page', String(p));
                return prev;
              })
            }
          />
        )}
      </div>
    </div>
  );
}
