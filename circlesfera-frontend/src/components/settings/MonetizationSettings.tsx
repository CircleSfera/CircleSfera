import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
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
import SettingsRow from './SettingsRow';
import SettingsSection from './SettingsSection';
import TaxDetailsSettings from './TaxDetailsSettings';

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
      >
        <SettingsRow
          label={t('settings.monetization.stripeConnect')}
          description={statusCopy}
          control={
            isConnected && isOnboarded && !needsUpdate ? (
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => dashboardMutation.mutate(openPendingTab())}
                isLoading={dashboardMutation.isPending}
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
              >
                {sharesAccount
                  ? t('settings.monetization.connect_own')
                  : needsUpdate
                    ? t('settings.monetization.update')
                    : isConnected
                      ? t('settings.monetization.complete')
                      : t('settings.monetization.connect')}
              </Button>
            )
          }
        >
          {sharesAccount ? (
            <p className="text-xs text-white/50 leading-relaxed mt-2">
              {t('settings.monetization.own_account_note')}
            </p>
          ) : null}
        </SettingsRow>
      </SettingsSection>

      {/* An account that cannot sell is replaced when it is updated, and
          what was set on it would go with it: its tax details wait. */}
      {isConnected && !needsUpdate ? <TaxDetailsSettings /> : null}

      {isTransfersEnabled ? (
        <SettingsSection title={t('settings.monetization.earnings')}>
          <SettingsRow
            label={t('settings.monetization.lifetime')}
            control={
              <span className="text-base font-semibold text-white tabular-nums tracking-tight">
                {formatCents(
                  monetization?.lifetimeEarningsCents || 0,
                  i18n.language,
                )}
              </span>
            }
          />
        </SettingsSection>
      ) : null}
    </div>
  );
}
