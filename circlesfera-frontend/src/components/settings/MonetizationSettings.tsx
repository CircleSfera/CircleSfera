import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { monetizationApi } from '../../services/monetization.service';
import { LoadingSpinner } from '../LoadingStates';
import { Button } from '../ui';
import SettingsSection from './SettingsSection';

export function MonetizationSettings() {
  const { t } = useTranslation();

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['monetization', 'status'],
    queryFn: () => monetizationApi.getStatus(),
  });

  const { data: monetization, isLoading: monetizationLoading } = useQuery({
    queryKey: ['monetization', 'details'],
    queryFn: () => monetizationApi.getMonetization(),
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const returnUrl = window.location.href;
      return monetizationApi.connectAccount(returnUrl, returnUrl);
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: () => {
      toast.error(t('settings.monetization.error_connect'));
    },
  });

  const dashboardMutation = useMutation({
    mutationFn: async () => {
      return monetizationApi.getDashboardLink();
    },
    onSuccess: (data) => {
      window.open(data.url, '_blank');
    },
    onError: () => {
      toast.error(t('settings.monetization.error_dashboard'));
    },
  });

  if (statusLoading || monetizationLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  const isConnected = status?.connected;
  const isTransfersEnabled = status?.transfersEnabled;
  const lifetimeEarnings = (monetization?.lifetimeEarningsCents || 0) / 100;
  const statusCopy = isTransfersEnabled
    ? t('settings.monetization.status.active')
    : isConnected
      ? t('settings.monetization.status.incomplete')
      : t('settings.monetization.status.unconnected');

  return (
    <div className="max-w-xl space-y-5">
      <SettingsSection
        title={t('settings.monetization.title')}
        description={t('settings.monetization.desc')}
        card={false}
      >
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">
              {t('settings.monetization.stripeConnect')}
            </p>
            <p className="text-xs text-white/50 mt-1 leading-relaxed">
              {statusCopy}
            </p>
          </div>
          {isConnected ? (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => dashboardMutation.mutate()}
              isLoading={dashboardMutation.isPending}
              className="shrink-0"
            >
              {t('settings.monetization.dashboard')}
              <ExternalLink size={14} aria-hidden />
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => connectMutation.mutate()}
              isLoading={connectMutation.isPending}
              className="shrink-0"
            >
              {t('settings.monetization.connect')}
            </Button>
          )}
        </div>
      </SettingsSection>

      {isTransfersEnabled ? (
        <SettingsSection
          title={t('settings.monetization.earnings')}
          card={false}
        >
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <p className="text-xs text-white/50">
              {t('settings.monetization.lifetime')}
            </p>
            <p className="text-xl font-semibold text-white mt-1 tracking-tight">
              ${lifetimeEarnings.toFixed(2)}
            </p>
          </div>
        </SettingsSection>
      ) : null}
    </div>
  );
}
