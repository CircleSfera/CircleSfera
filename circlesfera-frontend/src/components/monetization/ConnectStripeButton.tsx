import { useMutation } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../services';
import { Button } from '../ui';

export default function ConnectStripeButton() {
  const { t } = useTranslation();

  const connectMutation = useMutation({
    mutationFn: async () => {
      const returnUrl = `${window.location.origin}/creator?activeTab=monetization&connect_success=true`;
      const refreshUrl = `${window.location.origin}/creator?activeTab=monetization&connect_refresh=true`;
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
    onError: (error: any) => {
      toast.error(
        error.response?.data?.message ||
          t('monetization.connect_stripe_error', 'Failed to connect Stripe.'),
      );
    },
  });

  return (
    <div className="bg-brand-primary/10 border border-brand-primary/20 rounded-lg p-6 text-center">
      <ShieldCheck className="w-12 h-12 text-brand-primary mx-auto mb-4" />
      <h3 className="text-white font-bold text-lg mb-2">
        {t(
          'monetization.verify_identity',
          'Verify Identity to Receive Payouts',
        )}
      </h3>
      <p className="text-gray-300 text-sm mb-6">
        {t(
          'monetization.stripe_connect_desc',
          'To withdraw your earnings, you must securely verify your identity and link a bank account through Stripe Connect.',
        )}
      </p>
      <Button
        onClick={() => connectMutation.mutate()}
        isLoading={connectMutation.isPending}
        variant="primary"
        className="w-full bg-[#635BFF] hover:bg-[#5249ea] border-transparent px-5 py-2 font-bold shadow-none"
      >
        <ExternalLink size={18} className="mr-2" />
        {t('monetization.connect_with_stripe', 'Connect with Stripe')}
      </Button>
    </div>
  );
}
