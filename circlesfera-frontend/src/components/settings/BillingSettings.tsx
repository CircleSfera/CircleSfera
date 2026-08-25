import { useQuery } from '@tanstack/react-query';
import { Shield, Star } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { paymentsApi } from '../../services/payments.service';
import { LoadingSpinner } from '../LoadingStates';
import { Button } from '../ui';
import SettingsSection from './SettingsSection';

export default function BillingSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isProcessingPortal, setIsProcessingPortal] = useState(false);

  const { data: billingStatus, isLoading } = useQuery({
    queryKey: ['billingStatus'],
    queryFn: () => paymentsApi.getBillingStatus(),
    retry: false,
  });

  const handleUpgrade = () => navigate('/pricing');

  const handleBillingPortal = async () => {
    try {
      setIsProcessingPortal(true);
      const response = await paymentsApi.getBillingPortalUrl();
      if (response.url) {
        window.location.href = response.url;
      }
    } catch {
      toast.error(
        t('settings.billing.portal_error', 'Could not access billing portal.'),
      );
    } finally {
      setIsProcessingPortal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  const subscription = billingStatus?.subscription;
  const hasActiveSubscription = !!billingStatus?.hasActiveSubscription;

  return (
    <div className="max-w-xl space-y-5">
      <SettingsSection
        title={t('settings.billing.title')}
        description={t('settings.billing.subtitle')}
        card={false}
      >
        <div className="rounded-xl border border-white/5 bg-brand-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-brand-primary mb-1">
              {t('settings.billing.current_plan', 'Current plan')}
            </p>
            <h3 className="text-xl font-semibold text-white">
              {subscription?.planName || t('settings.billing.free', 'Free')}
            </h3>
            <p className="text-xs text-white/50 mt-1">
              {subscription?.status ||
                t('settings.billing.no_subscription', 'No active subscription')}
            </p>
            {subscription?.currentPeriodEnd && (
              <p className="text-xs text-white/40 mt-1">
                {subscription.cancelAtPeriodEnd
                  ? t('settings.billing.cancels_on', 'Cancels on')
                  : t('settings.billing.renews_on', 'Renews on')}{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
          <Button
            onClick={
              hasActiveSubscription ? handleBillingPortal : handleUpgrade
            }
            isLoading={isProcessingPortal}
            variant="white"
            className="min-h-11 px-6 text-sm font-semibold shrink-0"
          >
            {hasActiveSubscription
              ? t('settings.billing.manage', 'Manage billing')
              : t('settings.billing.view_plans', 'View plans')}
          </Button>
        </div>
      </SettingsSection>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
            <Shield size={18} className="text-brand-primary" aria-hidden />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">
              {t('settings.billing.verified_badge')}
            </h4>
            <p className="text-xs text-white/50">
              {t('settings.billing.verified_desc')}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
            <Star size={18} className="text-brand-primary" aria-hidden />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">
              {t('settings.billing.pro_insights')}
            </h4>
            <p className="text-xs text-white/50">
              {t('settings.billing.pro_desc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
