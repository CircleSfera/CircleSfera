import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../../services/reports.service';
import { LoadingSpinner } from '../LoadingStates';
import SettingsSection from './SettingsSection';

type MyReport = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function statusTone(status: string) {
  switch (status) {
    case 'RESOLVED':
      return 'text-white bg-white/10 border-white/15';
    case 'REJECTED':
      return 'text-brand-secondary bg-brand-secondary/10 border-brand-secondary/20';
    case 'REVIEWING':
      return 'text-brand-accent bg-brand-accent/10 border-brand-accent/20';
    default:
      return 'text-brand-primary bg-brand-primary/10 border-brand-primary/20';
  }
}

export default function MyReportsSettings() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['my-reports'],
    queryFn: async () => {
      const res = await reportsApi.getMine();
      return (res.data || []) as MyReport[];
    },
  });

  const statusLabel = (status: string) =>
    t(`settings.reports.status_${status.toLowerCase()}`, status);

  return (
    <div className="max-w-xl space-y-5">
      <SettingsSection
        title={t('settings.reports.title')}
        description={t('settings.reports.subtitle')}
        card={false}
      >
        {isLoading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner size="sm" />
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-white/50 text-center py-8 rounded-xl border border-white/5 bg-white/[0.02]">
            {t('settings.reports.empty')}
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((report) => (
              <li
                key={report.id}
                className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white min-w-0 truncate">
                    {report.targetType} · {report.reason}
                  </p>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border shrink-0 ${statusTone(report.status)}`}
                  >
                    {statusLabel(report.status)}
                  </span>
                </div>
                {report.details ? (
                  <p className="text-xs text-white/50 line-clamp-2">
                    {report.details}
                  </p>
                ) : null}
                <p className="text-xs text-white/40">
                  {new Date(report.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
