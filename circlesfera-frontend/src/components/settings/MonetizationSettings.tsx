import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2, Wallet } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { monetizationApi } from '../../services/monetization.service';
import { Button } from '../ui';

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
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Error al conectar con Stripe');
    },
  });

  const dashboardMutation = useMutation({
    mutationFn: async () => {
      return monetizationApi.getDashboardLink();
    },
    onSuccess: (data) => {
      window.open(data.url, '_blank');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Error al abrir Stripe Dashboard');
    },
  });

  if (statusLoading || monetizationLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const isConnected = status?.connected;
  const isTransfersEnabled = status?.transfersEnabled;
  const lifetimeEarnings = (monetization?.lifetimeEarningsCents || 0) / 100;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-2 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-purple-400" />
          {t('settings.monetization.title', 'Monetization')}
        </h3>
        <p className="text-gray-400 text-sm">
          {t(
            'settings.monetization.desc',
            'Manage your payments, payouts, and Stripe Connect account.',
          )}
        </p>
      </div>

      <div className="glass-panel rounded-xl p-6 border border-white/5 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-white font-medium">
              {t('settings.monetization.stripeConnect', 'Stripe Connect')}
            </h4>
            <p className="text-sm text-gray-400 mt-1">
              {isTransfersEnabled
                ? t(
                    'settings.monetization.status.active',
                    'Your account is active and can receive payouts.',
                  )
                : isConnected
                  ? t(
                      'settings.monetization.status.incomplete',
                      'Your account needs more details to receive payouts.',
                    )
                  : t(
                      'settings.monetization.status.unconnected',
                      'Connect with Stripe to start receiving tips.',
                    )}
            </p>
          </div>
          <div>
            {isConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => dashboardMutation.mutate()}
                disabled={dashboardMutation.isPending}
                className="flex items-center gap-2"
              >
                {dashboardMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {t('settings.monetization.dashboard', 'Stripe Dashboard')}
                <ExternalLink className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
              >
                {connectMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                )}
                {t('settings.monetization.connect', 'Connect Stripe')}
              </Button>
            )}
          </div>
        </div>

        {isTransfersEnabled && (
          <div className="pt-6 border-t border-white/5">
            <h4 className="text-white font-medium mb-4">
              {t('settings.monetization.earnings', 'Earnings Overview')}
            </h4>
            <div className="bg-white/5 rounded-lg p-4">
              <div className="text-sm text-gray-400">
                {t('settings.monetization.lifetime', 'Lifetime Earnings')}
              </div>
              <div className="text-2xl font-bold text-white mt-1">
                ${lifetimeEarnings.toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
