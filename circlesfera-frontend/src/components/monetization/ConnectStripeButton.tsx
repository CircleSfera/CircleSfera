import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../services';
import { Button } from '../ui';

export default function ConnectStripeButton() {
  const { t } = useTranslation();

  const connectMutation = useMutation({
    mutationFn: async () => {
      const returnUrl = `${window.location.origin}/creator/monetization?connect_success=true`;
      const refreshUrl = `${window.location.origin}/creator/monetization`;
      const response = await api.post('/monetization/connect', {
        returnUrl,
        refreshUrl,
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : undefined;
      toast.error(
        message ||
          t('monetization.connect_stripe_error', 'Failed to connect Stripe.'),
      );
    },
  });

  return (
    <div className="text-center">
      <ShieldCheck className="w-10 h-10 text-brand-primary mx-auto mb-3" />
      <h3 className="text-white font-medium text-base mb-1">
        {t(
          'monetization.verify_identity',
          'Verify identity to receive payouts',
        )}
      </h3>
      <p className="text-white/50 text-sm mb-5">
        {t(
          'monetization.stripe_connect_desc',
          'To withdraw earnings, verify your identity and link a bank account with Stripe Connect.',
        )}
      </p>
      <Button
        onClick={() => connectMutation.mutate()}
        isLoading={connectMutation.isPending}
        variant="primary"
        className="w-full min-h-11"
      >
        <ExternalLink size={16} className="mr-2" aria-hidden />
        {t('monetization.connect_with_stripe', 'Connect with Stripe')}
      </Button>
    </div>
  );
}
