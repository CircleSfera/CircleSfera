import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileArchive,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { paymentsApi } from '../services/payments.service';
import { usersApi } from '../services/users.service';

export function DataExportSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Fetch export history
  const { data, isLoading } = useQuery({
    queryKey: ['exportHistory'],
    queryFn: () => usersApi.getExportHistory(),
  });

  const exports = data?.data || [];

  const exportDataMutation = useMutation({
    mutationFn: () => usersApi.requestExport(),
    onSuccess: () => {
      toast.success(
        t(
          'settings.account.export_success',
          'Data export started. You will receive an email when it is ready.',
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['exportHistory'] });
    },
    onError: () => {
      toast.error(
        t('settings.account.export_error', 'Failed to request data export.'),
      );
    },
  });

  const downloadLedgerMutation = useMutation({
    mutationFn: () => paymentsApi.getLedger(),
    onSuccess: (data) => {
      const url = window.URL.createObjectURL(data as any);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'ledger.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t('settings.account.ledger_success', 'Ledger downloaded.'));
    },
    onError: () => {
      toast.error(
        t('settings.account.ledger_error', 'Failed to download ledger.'),
      );
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <FileArchive size={20} className="text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-white text-lg tracking-tight">
            {t('settings.account.export.title', 'Download Your Data')}
          </h3>
          <p className="text-xs text-gray-300">
            {t(
              'settings.account.export.desc',
              'Download a copy of your data including your profile, posts, and messages. This process may take a few minutes.',
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => exportDataMutation.mutate()}
          disabled={exportDataMutation.isPending}
          className="px-5 py-2.5 bg-blue-500/10 text-blue-400 rounded-xl font-bold text-xs uppercase tracking-wide hover:bg-blue-500/20 transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          {exportDataMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Download size={16} />
          )}
          {t('settings.account.export.btn', 'Request Export')}
        </button>
      </div>

      {/* Financial Ledger Export */}
      <div className="flex items-center gap-3 mt-6 pt-6 border-t border-white/10">
        <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
          <CreditCard size={20} className="text-green-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-white text-lg tracking-tight">
            {t('settings.account.ledger.title', 'Financial Ledger')}
          </h3>
          <p className="text-xs text-gray-300">
            {t(
              'settings.account.ledger.desc',
              'Download a complete CSV record of all your financial transactions.',
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => downloadLedgerMutation.mutate()}
          disabled={downloadLedgerMutation.isPending}
          className="px-5 py-2.5 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-white rounded-xl font-bold text-xs uppercase tracking-wide transition-colors border border-white/5 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
        >
          {downloadLedgerMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Download size={16} />
          )}
          {t('settings.account.ledger.button', 'Download Ledger')}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-4">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      ) : exports.length > 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 bg-white/2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-300">
              {t('settings.account.export.history', 'Export History')}
            </h4>
          </div>
          <div className="divide-y divide-white/10">
            {exports.map((exp: any) => (
              <div
                key={exp.id}
                className="p-5 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {exp.status === 'COMPLETED' ? (
                    <CheckCircle2 size={20} className="text-green-400" />
                  ) : exp.status === 'PENDING' ||
                    exp.status === 'PROCESSING' ? (
                    <Clock size={20} className="text-blue-400 animate-pulse" />
                  ) : (
                    <AlertCircle size={20} className="text-red-400" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">
                      {new Date(exp.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1">
                      {exp.status}
                    </p>
                  </div>
                </div>

                {exp.status === 'COMPLETED' && exp.url && (
                  <a
                    href={exp.url}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-white/10 text-white rounded-lg font-bold text-xs hover:bg-white/20 transition-colors flex items-center gap-2"
                  >
                    <Download size={14} />
                    {t('settings.account.export.download', 'Download')}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
