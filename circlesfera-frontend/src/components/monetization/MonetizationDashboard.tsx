import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  ShieldCheck,
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

interface Transaction {
  id: string;
  type: string;
  amountCents: number;
  receiverId: string;
  createdAt: string;
  sender?: { username: string };
  receiver?: { username: string };
  description?: string;
  amount?: number;
}

interface MonetizationData {
  userId: string;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  walletBalanceCents: number;
  pendingBalanceCents: number;
  totalEarnedCents: number;
  lifetimeEarningsCents: number;
}

interface FinancialSummary {
  currentMonthIncome: number;
  totalTips: number;
  breakdown?: {
    postUnlocks: number;
    storyUnlocks: number;
    messageUnlocks: number;
    tips: number;
    liveGifts: number;
  };
}

export default function MonetizationDashboard() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const profile = useAuthStore((state) => state.profile);
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

  const { data: monetization } = useQuery<MonetizationData>({
    queryKey: ['monetization'],
    queryFn: () => api.get('/monetization').then((r) => r.data),
  });

  const { data: summary } = useQuery<FinancialSummary>({
    queryKey: ['monetization-summary'],
    queryFn: () => api.get('/monetization/summary').then((r) => r.data),
  });

  const { data: transactions } = useQuery<Transaction[]>({
    queryKey: ['monetization-transactions'],
    queryFn: () =>
      api.get('/monetization/transactions').then((r) => r.data.data),
  });

  const hasConnect = !!profile?.user?.stripeConnectAccountId;

  const { data: payoutsSummary } = useQuery({
    queryKey: ['monetization-payouts'],
    queryFn: () => api.get('/monetization/payouts').then((r) => r.data),
    enabled: hasConnect,
    retry: false,
  });

  const handleConnectStripe = async () => {
    setIsConnecting(true);
    try {
      const returnUrl = `${window.location.origin}/creator/monetization?connect_success=true`;
      const refreshUrl = `${window.location.origin}/creator/monetization`;
      const response = await api.post('/monetization/connect', {
        returnUrl,
        refreshUrl,
      });
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        toast.error(
          error.response?.data?.message ||
            t('wallet.error_connect_stripe', 'Error connecting Stripe'),
        );
      } else {
        toast.error(
          t('wallet.error_connect_stripe', 'Error connecting Stripe'),
        );
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const lifetimeEarnings = (monetization?.lifetimeEarningsCents || 0) / 100;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* 2-Column Hero: Lifetime Earnings & How it Works */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Earnings Card */}
        <div className="p-5 sm:p-6 rounded-2xl bg-zinc-950/90 border border-white/8 backdrop-blur-xl shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
            <WalletIcon size={140} />
          </div>

          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {t('wallet.lifetime_earnings', 'Ingresos Históricos Totales')}
              </span>
              {hasConnect && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 size={11} /> Conectado
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-4xl sm:text-5xl font-black text-white font-mono tracking-tight">
                ${lifetimeEarnings.toFixed(2)}
              </span>
              <span className="text-sm font-bold text-gray-400">USD</span>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              {t(
                'wallet.earnings_description',
                'Fondos acumulados transferidos automáticamente a tu cuenta Stripe vinculada.',
              )}
            </p>
          </div>

          <div className="mt-5 relative z-10">
            {profile?.user?.stripeConnectAccountId ? (
              <Button
                onClick={handleConnectStripe}
                isLoading={isConnecting}
                variant="secondary"
                className="w-full min-h-11 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold uppercase tracking-wider shadow-md"
              >
                <ArrowUpRight size={16} className="mr-1.5" />
                {t('wallet.go_to_stripe_dashboard', 'Ver Dashboard de Stripe')}
              </Button>
            ) : (
              <div className="w-full">
                <ConnectStripeButton />
              </div>
            )}
          </div>
        </div>

        {/* How Creator Economy Works */}
        <div className="p-5 sm:p-6 rounded-2xl bg-zinc-950/80 border border-white/8 backdrop-blur-xl shadow-xl flex flex-col justify-center">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Coins size={16} className="text-brand-primary" />
            {t('wallet.how_it_works', 'Modelo de Monetización')}
          </h3>

          <ul className="space-y-3 text-xs text-gray-300">
            <li className="flex items-start gap-2.5">
              <div className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0" />
              <p>
                <strong className="text-white">80% para el Creador:</strong>{' '}
                {t(
                  'wallet.revenue_share',
                  'Mantienes el 80% neto de suscripciones, propinas y contenido bloqueado.',
                )}
              </p>
            </li>
            <li className="flex items-start gap-2.5">
              <div className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0" />
              <p>
                <strong className="text-white">Pagos Automáticos:</strong>{' '}
                {t(
                  'wallet.direct_payouts',
                  'Los fondos son transferidos directamente a tu cuenta bancaria por Stripe.',
                )}
              </p>
            </li>
            <li className="flex items-start gap-2.5">
              <div className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0" />
              <p>
                <strong className="text-white">Sin Mínimo de Retiro:</strong>{' '}
                {t(
                  'wallet.no_minimums',
                  'No requieres acumulaciones mínimas para procesar transferencias.',
                )}
              </p>
            </li>
          </ul>
        </div>
      </div>

      {/* Revenue Breakdown */}
      {summary?.breakdown && (
        <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-white/8 backdrop-blur-xl shadow-xl space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
            {t('wallet.revenue_breakdown', 'Desglose por Tipo de Contenido')}
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="p-3 rounded-xl bg-white/3 border border-white/6">
              <p className="text-[11px] font-semibold text-gray-400 uppercase">
                {t('wallet.posts_ppv', 'Post PPV')}
              </p>
              <p className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                ${((summary.breakdown.postUnlocks || 0) / 100).toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/3 border border-white/6">
              <p className="text-[11px] font-semibold text-gray-400 uppercase">
                {t('wallet.stories_ppv', 'Story PPV')}
              </p>
              <p className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                ${((summary.breakdown.storyUnlocks || 0) / 100).toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/3 border border-white/6">
              <p className="text-[11px] font-semibold text-gray-400 uppercase">
                {t('wallet.messages_ppv', 'DMs Bloqueados')}
              </p>
              <p className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                ${((summary.breakdown.messageUnlocks || 0) / 100).toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/3 border border-white/6">
              <p className="text-[11px] font-semibold text-gray-400 uppercase">
                {t('wallet.tips', 'Propinas')}
              </p>
              <p className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                ${((summary.breakdown.tips || 0) / 100).toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/3 border border-white/6">
              <p className="text-[11px] font-semibold text-gray-400 uppercase">
                {t('wallet.live_gifts', 'Regalos Live')}
              </p>
              <p className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                ${((summary.breakdown.liveGifts || 0) / 100).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stripe Connect read-only status */}
      {hasConnect && payoutsSummary && (
        <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-white/8 backdrop-blur-xl shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-400" />
              {t('wallet.stripe_payouts_title', 'Saldos Stripe Connect')}
            </h3>
            <span className="text-[11px] text-gray-500">
              Actualizado vía API
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-white/3 border border-white/6">
              <p className="text-[11px] uppercase text-gray-400 font-semibold mb-0.5">
                {t('wallet.available', 'Disponible para Transferencia')}
              </p>
              <p className="text-2xl font-black text-emerald-400 font-mono">
                {(
                  (payoutsSummary.available?.[0]?.amountCents || 0) / 100
                ).toFixed(2)}{' '}
                <span className="text-xs font-bold text-gray-400">
                  {payoutsSummary.available?.[0]?.currency || 'EUR'}
                </span>
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white/3 border border-white/6">
              <p className="text-[11px] uppercase text-gray-400 font-semibold mb-0.5">
                {t('wallet.pending', 'En Proceso de Liberación')}
              </p>
              <p className="text-2xl font-black text-amber-400 font-mono">
                {(
                  (payoutsSummary.pending?.[0]?.amountCents || 0) / 100
                ).toFixed(2)}{' '}
                <span className="text-xs font-bold text-gray-400">
                  {payoutsSummary.pending?.[0]?.currency || 'EUR'}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-white/8 backdrop-blur-xl shadow-xl space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
          {t(
            'wallet.transaction_history',
            'Historial Reciente de Transacciones',
          )}
        </h3>

        <div className="space-y-2">
          {transactions?.map((tx) => {
            const isIncoming = tx.receiverId === monetization?.userId;
            const isPurchase =
              tx.type.includes('UNLOCK') || tx.type.includes('SUBSCRIPTION');

            return (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-xl bg-white/2 border border-white/5 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isIncoming
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                    }`}
                  >
                    {isPurchase ? (
                      <Coins size={18} />
                    ) : isIncoming ? (
                      <ArrowDownLeft size={18} />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">
                      {tx.description || tx.type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <span
                  className={`font-mono font-bold text-sm ${
                    isIncoming ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isIncoming ? '+' : '-'}${((tx.amount || 0) / 100).toFixed(2)}
                </span>
              </div>
            );
          })}

          {(!transactions || transactions.length === 0) && (
            <div className="text-center py-8">
              <Coins className="mx-auto h-8 w-8 text-gray-600 mb-2 opacity-50" />
              <p className="text-xs text-gray-400">
                {t(
                  'wallet.no_transactions',
                  'Sin transacciones registradas aún.',
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
