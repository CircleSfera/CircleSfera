import { useMutation } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../services';

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
    <div className="bg-brand-primary/10 border border-brand-primary/20 rounded-2xl p-6 text-center">
      <ShieldCheck className="w-12 h-12 text-brand-primary mx-auto mb-4" />
      <h3 className="text-white font-bold text-lg mb-2">
        {t('monetization.verify_identity', 'Verify Identity to Receive Payouts')}
      </h3>
      <p className="text-gray-400 text-sm mb-6">
        {t(
          'monetization.stripe_connect_desc',
          'To withdraw your earnings, you must securely verify your identity and link a bank account through Stripe Connect.',
        )}
      </p>
      <button
        type="button"
        onClick={() => connectMutation.mutate()}
        disabled={connectMutation.isPending}
        className="bg-[#635BFF] hover:bg-[#5249ea] text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 w-full transition-colors disabled:opacity-50"
      >
        <ExternalLink size={18} />
        {connectMutation.isPending
          ? t('monetization.connecting', 'Connecting...')
          : t('monetization.connect_with_stripe', 'Connect with Stripe')}
      </button>
    </div>
  );
}
