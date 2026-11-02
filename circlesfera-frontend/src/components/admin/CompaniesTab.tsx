import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Check, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { adminApi } from '../../services/admin.service';
import { UserAvatar } from '../index';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import {
  ADMIN_PAGE_LIST_STATE,
  ADMIN_PAGE_ROW,
  AdminListRow,
} from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { Pagination, SearchInput } from './AdminTable';

// One condition of the label, met or not, said in words as well as by its
// mark.
function Condition({ met, label }: { met: boolean; label: string }) {
  const Icon = met ? Check : X;
  return (
    <span
      className={`inline-flex items-start gap-1 ${met ? 'text-green-400' : 'text-white/60'}`}
    >
      <Icon size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Business Profiles and why each shows the "Verified company" label or not:
 * the Business plan, a payout account and a company the payment provider has
 * verified. Read only, for support to answer without the provider's
 * dashboard.
 */
export default function CompaniesTab() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 400);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'companies', page, debounced],
    queryFn: () =>
      adminApi
        .getCompanies({ page, limit: 20, search: debounced || undefined })
        .then((res) => res.data),
  });

  const hasRows = !isLoading && !isError && !!data?.data.length;
  const yesNo = (met: boolean, key: string) =>
    t(`admin.companies.${key}_${met ? 'yes' : 'no'}`);

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.companies.title')}
        subtitle={t('admin.companies.subtitle')}
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder={t('admin.companies.search_placeholder')}
          />
        </div>
      </AdminFilterBar>

      <div className={hasRows ? undefined : ADMIN_PAGE_LIST_STATE}>
        {isLoading ? (
          <AdminListSkeleton rows={6} />
        ) : isError || !data ? (
          <AdminEmptyState
            icon={BadgeCheck}
            title={t('admin.companies.load_failed')}
          />
        ) : data.data.length === 0 ? (
          <AdminEmptyState
            icon={BadgeCheck}
            title={t('admin.companies.empty_title')}
            description={t('admin.companies.empty_description')}
          />
        ) : (
          <div className="space-y-3">
            {data.data.map((company) => (
              <AdminListRow
                className={ADMIN_PAGE_ROW}
                key={company.id}
                title={`@${company.username}`}
                subtitle={company.fullName ?? undefined}
                avatar={
                  <UserAvatar
                    src={company.avatar}
                    alt={company.fullName || company.username}
                    size="md"
                  />
                }
                badge={
                  <div
                    className={`px-2.5 py-1 rounded-full border text-xs font-bold ${
                      company.labelShown
                        ? 'text-green-400 bg-green-400/10 border-green-400/20'
                        : 'text-white/60 bg-white/10 border-white/20'
                    }`}
                  >
                    {t(
                      company.labelShown
                        ? 'admin.companies.label_shown'
                        : 'admin.companies.label_not_shown',
                    )}
                  </div>
                }
                meta={
                  <>
                    <Condition
                      met={company.onBusinessPlan}
                      label={yesNo(company.onBusinessPlan, 'plan')}
                    />
                    <Condition
                      met={company.payoutConnected}
                      label={yesNo(company.payoutConnected, 'payout')}
                    />
                    <Condition
                      met={company.companyVerified}
                      label={yesNo(company.companyVerified, 'verified')}
                    />
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>

      {data && data.data.length > 0 && (
        <Pagination meta={data.meta} onPageChange={setPage} />
      )}
    </div>
  );
}
