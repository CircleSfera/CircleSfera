import { useQuery } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../../services/reports.service';

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

const statusTone = (status: string) => {
  switch (status) {
    case 'RESOLVED':
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'REJECTED':
      return 'text-red-400 bg-red-500/10 border-red-500/20';
    case 'REVIEWING':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    default:
      return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  }
};

export default function MyReportsSettings() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['my-reports'],
    queryFn: async () => {
      const res = await reportsApi.getMine();
      return (res.data || []) as MyReport[];
    },
  });

  return (
    <div className="max-w-xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-black text-white tracking-tighter">
          {t('settings.reports.title', 'My reports')}
        </h2>
        <p className="text-gray-300 text-sm font-medium mt-1 uppercase tracking-wide italic opacity-60">
          {t(
            'settings.reports.subtitle',
            'Status of content and profile reports you filed',
          )}
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">
          {t('common.loading', 'Loading…')}
        </p>
      ) : !data?.length ? (
        <div className="bg-white/2 border border-white/5 rounded-xl p-6 text-center">
          <Flag className="mx-auto text-white/20 mb-3" size={28} />
          <p className="text-sm text-gray-500">
            {t('settings.reports.empty', 'You have not filed any reports yet.')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((report) => (
            <div
              key={report.id}
              className="bg-white/2 border border-white/5 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-white">
                  {report.targetType} · {report.reason}
                </p>
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full border ${statusTone(report.status)}`}
                >
                  {report.status}
                </span>
              </div>
              {report.details && (
                <p className="text-xs text-gray-400 line-clamp-2">
                  {report.details}
                </p>
              )}
              <p className="text-[11px] text-gray-600 font-medium">
                {new Date(report.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
