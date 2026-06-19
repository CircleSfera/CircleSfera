import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../ui';
import ConnectStripeButton from './ConnectStripeButton';

export default function MonetizationDashboard() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuthStore();
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (searchParams.get('connect_success') === 'true') {
      toast.success(
        t('wallet.connect_success', 'Stripe account linked successfully!'),
      );
      searchParams.delete('connect_success');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams, t]);

  const { data: monetization } = useQuery({
    queryKey: ['monetization'],
    queryFn: () => api.get('/monetization').then((r: any) => r.data),
  });

  const { data: transactions } = useQuery({
    queryKey: ['monetization-transactions'],
    queryFn: () =>
      api.get('/monetization/transactions').then((r: any) => r.data.data),
  });

  const handleConnectStripe = async () => {
    setIsConnecting(true);
    try {
      const returnUrl = `${window.location.origin}/creator?activeTab=monetization&connect_success=true`;
      const refreshUrl = `${window.location.origin}/creator?activeTab=monetization`;
      const response = await api.post('/monetization/connect', {
        returnUrl,
        refreshUrl,
      });
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          t('wallet.error_connect_stripe', 'Error connecting Stripe'),
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const lifetimeEarnings = (monetization?.lifetimeEarningsCents || 0) / 100;

  return (
    <div className="max-w-4xl mx-auto space-y-4 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Earnings Card */}
        <div className="p-8 rounded-xl bg-linear-to-br from-brand-primary to-brand-secondary text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-20">
            <WalletIcon size={160} className="-mr-12 -mt-12" />
          </div>
          <div className="relative z-10">
            <h3 className="text-white/80 font-bold uppercase tracking-wide text-sm mb-2">
              {t('wallet.lifetime_earnings', 'Lifetime Earnings')}
            </h3>
            <div className="flex items-end gap-2">
              <span className="text-6xl font-black tracking-tighter">
                ${lifetimeEarnings.toFixed(2)}
              </span>
              <span className="text-xl pb-2 font-bold opacity-80">USD</span>
            </div>

            <p className="mt-4 text-white/80 text-sm max-w-[80%]">
              {t(
                'wallet.earnings_description',
                'These are your total historical earnings. All funds are automatically sent to your connected Stripe account.',
              )}
            </p>

            <div className="mt-8">
              {profile?.user?.stripeConnectAccountId ? (
                <Button
                  onClick={handleConnectStripe}
                  isLoading={isConnecting}
                  variant="secondary"
                  className="w-full py-4 bg-white text-brand-primary border-transparent font-bold shadow-lg hover:bg-white/90"
                >
                  <ArrowUpRight size={20} className="mr-2" />
                  {t('wallet.go_to_stripe_dashboard', 'View Stripe Dashboard')}
                </Button>
              ) : (
                <div className="w-full">
                  <ConnectStripeButton />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="p-8 rounded-xl modal-glass border border-white/5 relative overflow-hidden flex flex-col justify-center">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Coins className="text-brand-primary" />
            {t('wallet.how_it_works', 'How Creator Economy Works')}
          </h3>
          <ul className="space-y-4 text-gray-400">
            <li className="flex items-start gap-3">
              <div className="mt-1 w-2 h-2 rounded-full bg-brand-primary" />
              <p>
                <strong>80% Revenue Share:</strong>{' '}
                {t(
                  'wallet.revenue_share',
                  'You keep 80% of all direct tips, post unlocks, and subscriptions.',
                )}
              </p>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1 w-2 h-2 rounded-full bg-brand-primary" />
              <p>
                <strong>Direct Payouts:</strong>{' '}
                {t(
                  'wallet.direct_payouts',
                  'Funds are routed directly to your connected bank account via Stripe Connect.',
                )}
              </p>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1 w-2 h-2 rounded-full bg-brand-primary" />
              <p>
                <strong>No Minimums:</strong>{' '}
                {t(
                  'wallet.no_minimums',
                  "You don't need to request withdrawals. Stripe handles transfers automatically.",
                )}
              </p>
            </li>
          </ul>
        </div>
      </div>

      {/* Transactions */}
      <div className="modal-glass rounded-xl p-6 mt-8">
        <h3 className="text-xl font-bold text-white mb-6">
          {t('wallet.transaction_history', 'Transaction History')}
        </h3>
        <div className="space-y-4">
          {transactions?.map((tx: any) => {
            const isIncoming = tx.receiverId === monetization?.userId;
            const isPurchase =
              tx.type.includes('UNLOCK') || tx.type.includes('SUBSCRIPTION');

            return (
              <div
                key={tx.id}
                className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      isIncoming
                        ? 'bg-emerald-500/20 text-emerald-500'
                        : 'bg-rose-500/20 text-rose-500'
                    }`}
                  >
                    {isPurchase ? (
                      <Coins size={24} />
                    ) : isIncoming ? (
                      <ArrowDownLeft size={24} />
                    ) : (
                      <ArrowUpRight size={24} />
                    )}
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg">
                      {tx.description || tx.type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-gray-400 text-sm">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div
                  className={`font-black text-xl ${isIncoming ? 'text-emerald-500' : 'text-rose-500'}`}
                >
                  {isIncoming ? '+' : '-'}${((tx.amount || 0) / 100).toFixed(2)}
                </div>
              </div>
            );
          })}
          {(!transactions || transactions.length === 0) && (
            <div className="text-center py-12">
              <Coins className="mx-auto h-12 w-12 text-gray-600 mb-4" />
              <p className="text-gray-400 text-lg">
                {t('wallet.no_transactions', 'No transactions found.')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
