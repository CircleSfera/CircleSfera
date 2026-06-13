import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Plus,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../services';

export default function WalletDashboard() {
  const { t } = useTranslation();
  const [amountToBuy, setAmountToBuy] = useState('');
  const [isBuying, setIsBuying] = useState(false);

  const { data: wallet, refetch } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get('/wallet').then((r: any) => r.data),
  });

  const { data: transactions } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: () =>
      api.get('/wallet/transactions').then((r: any) => r.data.data),
  });

  const handleBuyTokens = async () => {
    const amount = parseInt(amountToBuy, 10);
    if (!amount || amount <= 0) return;

    setIsBuying(true);
    try {
      await api.post('/wallet/purchase', { amount });
      toast.success(t('wallet.bought_tokens', { amount }));
      setAmountToBuy('');
      refetch();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || t('wallet.error_buy_tokens'),
      );
    } finally {
      setIsBuying(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Balance Card */}
        <div className="p-6 rounded-3xl bg-linear-to-br from-brand-primary to-brand-secondary text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-20">
            <WalletIcon size={120} className="-mr-8 -mt-8" />
          </div>
          <div className="relative z-10">
            <h3 className="text-white/80 font-bold uppercase tracking-widest text-xs mb-2">
              {t('wallet.available_balance')}
            </h3>
            <div className="flex items-end gap-2">
              <span className="text-5xl font-black tracking-tighter">
                {wallet?.balance || 0}
              </span>
              <span className="text-xl pb-1 font-bold">
                {t('wallet.tokens')}
              </span>
            </div>

            <div className="mt-8">
              <div className="flex bg-white/10 p-1 rounded-xl backdrop-blur-md">
                <input
                  type="number"
                  placeholder={t('wallet.amount_placeholder')}
                  value={amountToBuy}
                  onChange={(e) => setAmountToBuy(e.target.value)}
                  className="bg-transparent border-none text-white placeholder-white/50 focus:ring-0 w-full px-4"
                />
                <button
                  type="button"
                  onClick={handleBuyTokens}
                  disabled={
                    isBuying ||
                    !amountToBuy ||
                    Number.isNaN(parseInt(amountToBuy, 10)) ||
                    parseInt(amountToBuy, 10) <= 0
                  }
                  className="bg-white text-brand-primary px-4 py-2 rounded-lg font-bold disabled:opacity-50 flex items-center gap-2 transition-transform active:scale-95"
                >
                  <Plus size={16} /> {t('wallet.buy')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Earned Card */}
        <div className="p-6 rounded-3xl modal-glass border border-white/5 relative overflow-hidden">
          <h3 className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-2">
            {t('wallet.earnings_withdrawable')}
          </h3>
          <div className="flex items-end gap-2">
            <span className="text-5xl font-black text-yellow-500 tracking-tighter">
              {wallet?.earnedTokens || 0}
            </span>
            <span className="text-xl pb-1 text-gray-500 font-bold">
              {t('wallet.tokens')}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-2">
            ≈ ${(wallet?.earnedTokens || 0) * 0.01} USD
          </p>

          <button
            type="button"
            className="mt-8 w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-colors"
          >
            {t('wallet.request_withdrawal')}
          </button>
        </div>
      </div>

      {/* Transactions */}
      <div className="modal-glass rounded-3xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">
          {t('wallet.transaction_history')}
        </h3>
        <div className="space-y-4">
          {transactions?.map((tx: any) => {
            const isIncoming = tx.receiverId === wallet?.userId;
            const isPurchase = tx.type === 'TOKEN_PURCHASE';

            return (
              <div
                key={tx.id}
                className="flex items-center justify-between p-4 rounded-2xl bg-white/5"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isPurchase
                        ? 'bg-blue-500/20 text-blue-500'
                        : isIncoming
                          ? 'bg-emerald-500/20 text-emerald-500'
                          : 'bg-rose-500/20 text-rose-500'
                    }`}
                  >
                    {isPurchase ? (
                      <Coins size={20} />
                    ) : isIncoming ? (
                      <ArrowDownLeft size={20} />
                    ) : (
                      <ArrowUpRight size={20} />
                    )}
                  </div>
                  <div>
                    <p className="text-white font-bold">
                      {tx.description || tx.type}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div
                  className={`font-black ${isPurchase || isIncoming ? 'text-emerald-500' : 'text-rose-500'}`}
                >
                  {isPurchase || isIncoming ? '+' : '-'}
                  {tx.amount}
                </div>
              </div>
            );
          })}
          {transactions?.length === 0 && (
            <p className="text-center text-gray-500 py-8">
              {t('wallet.no_transactions')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
