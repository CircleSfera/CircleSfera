import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppealStatus } from '../../services/appeals.service';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminPageHeader } from './AdminPageHeader';
import { FilterDropdown } from './AdminTable';
import AppealsList from './AppealsList';

export default function AppealsTab() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.appeals.title')}
        subtitle={t('admin.appeals.subtitle')}
      />

      <AdminFilterBar>
        <FilterDropdown
          label={t('admin.appeals.filter_status')}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={[
            { value: '', label: t('admin.appeals.status_all') },
            { value: 'PENDING', label: t('admin.appeals.status_pending') },
            { value: 'APPROVED', label: t('admin.appeals.status_approved') },
            { value: 'REJECTED', label: t('admin.appeals.status_rejected') },
          ]}
        />
      </AdminFilterBar>

      <div className="rounded-xl border border-white/10 bg-black/20 p-2">
        <AppealsList
          statusFilter={(statusFilter || undefined) as AppealStatus | undefined}
          page={page}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
