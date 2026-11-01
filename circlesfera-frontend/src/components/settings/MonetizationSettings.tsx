import { Capacitor } from '@capacitor/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { monetizationApi } from '../../services/monetization.service';
import { reportPaymentError } from '../../utils/identityVerification';
import { formatCents } from '../../utils/money';
import {
  dropPendingTab,
  openPendingTab,
  sendPendingTab,
} from '../../utils/pendingTab';
import { LoadingSpinner } from '../LoadingStates';
import { Button } from '../ui';
import SettingsSection from './SettingsSection';

// The provider's script comes only with the panels, where they are shown.
const TaxDetailsPanels = lazy(() => import('./TaxDetailsPanels'));

export function MonetizationSettings() {
  const { t, i18n } = useTranslation();

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
    onError: (error: unknown) => {
      reportPaymentError(error, t, 'settings.monetization.error_connect');
    },
  });

  // The tab is opened at the tap and filled when the link arrives: opened
  // after the wait, a phone refuses it and says nothing.
  const dashboardMutation = useMutation({
    mutationFn: (_tab: Window | null) => monetizationApi.getDashboardLink(),
    onSuccess: (data, tab) => {
      sendPendingTab(tab, data.url);
    },
    onError: (_error, tab) => {
      dropPendingTab(tab);
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

  // This Profile is paid into the account of another Profile of the person,
  // and can connect one of its own.
  const sharesAccount = status?.connected && status.ownAccount === false;
  const isConnected = status?.connected && !sharesAccount;
  const isTransfersEnabled = status?.transfersEnabled;
  // Stripe's panel opens once its onboarding is done; until then the account
  // goes back to the onboarding.
  const isOnboarded = status?.detailsSubmitted !== false;
  // Paid out to but not able to sell: an account opened before sales were
  // charged on the creator's own account, which connecting again replaces.
  const needsUpdate =
    isConnected && isTransfersEnabled && status?.chargesEnabled === false;
  const statusCopy = sharesAccount
    ? t('settings.monetization.status.shared')
    : needsUpdate
      ? t('settings.monetization.status.update')
      : isTransfersEnabled
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
          {isConnected && isOnboarded && !needsUpdate ? (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => dashboardMutation.mutate(openPendingTab())}
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
              {sharesAccount
                ? t('settings.monetization.connect_own')
                : needsUpdate
                  ? t('settings.monetization.update')
                  : isConnected
                    ? t('settings.monetization.complete')
                    : t('settings.monetization.connect')}
            </Button>
          )}
        </div>
        {sharesAccount ? (
          <p className="text-xs text-white/50 leading-relaxed mt-3">
            {t('settings.monetization.own_account_note')}
          </p>
        ) : null}
      </SettingsSection>

      {isConnected ? (
        <SettingsSection
          title={t('settings.monetization.tax.title')}
          description={t('settings.monetization.tax.desc')}
          card={false}
        >
          {/* The provider's panels do not run inside the phone apps. Where
              they do, the card is solid, of the colour they are drawn on,
              as their frames cannot be see-through like the other cards. */}
          {Capacitor.isNativePlatform() ? (
            <p className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-xs text-white/60 leading-relaxed">
              {t('settings.monetization.tax.on_web')}
            </p>
          ) : (
            <div className="rounded-xl border border-white/5 bg-surface-glass-solid overflow-hidden">
              <Suspense
                fallback={
                  <div className="flex justify-center py-8">
                    <LoadingSpinner size="sm" />
                  </div>
                }
              >
                <TaxDetailsPanels />
              </Suspense>
            </div>
          )}
        </SettingsSection>
      ) : null}

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
              {formatCents(
                monetization?.lifetimeEarningsCents || 0,
                i18n.language,
              )}
            </p>
          </div>
        </SettingsSection>
      ) : null}
    </div>
  );
}
