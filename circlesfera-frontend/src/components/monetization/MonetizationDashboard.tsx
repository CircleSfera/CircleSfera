import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Coins, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { monetizationApi } from '../../services/monetization.service';
import { useAuthStore } from '../../stores/authStore';
import { Card } from '../ui';

interface Transaction {
  id: string;
  type: string;
  amountCents?: number;
  receiverId: string;
  createdAt: string;
  description?: string;
  amount?: number;
}

interface MonetizationData {
  userId: string;
  lifetimeEarningsCents: number;
}

/** Ledger + Stripe balances for the merged Ingresos surface. No in-app wallet. */
export default function MonetizationDashboard() {
  const { t } = useTranslation();
  const profile = useAuthStore((state) => state.profile);
  const hasConnect = !!profile?.user?.stripeConnectAccountId;

  const { data: monetization } = useQuery<MonetizationData>({
    queryKey: ['monetization'],
    queryFn: monetizationApi.getMonetization,
  });

  const { data: summary } = useQuery({
    queryKey: ['monetization-summary'],
    queryFn: monetizationApi.getFinancialSummary,
  });

  const { data: txPage } = useQuery({
    queryKey: ['monetization-transactions'],
    queryFn: () => monetizationApi.getTransactions(1, 20),
  });

  const transactions: Transaction[] = txPage?.data ?? [];

  const { data: payoutsSummary } = useQuery({
    queryKey: ['monetization-payouts'],
    queryFn: monetizationApi.getPayouts,
    enabled: hasConnect,
    retry: false,
  });

  const breakdown = summary?.breakdown;

  return (
    <div className="space-y-4">
      {breakdown ? (
        <Card variant="glass" className="p-5 space-y-3">
          <h3 className="text-sm font-medium text-white">
            {t('creator.income.breakdown', 'Breakdown by type')}
          </h3>
          <p className="text-xs text-white/50">
            {t(
              'creator.income.breakdown_hint',
              'Amounts are the creator share after Stripe applies the 20% platform fee.',
            )}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(
              [
                ['creator.income.posts_ppv', 'Post PPV', breakdown.postUnlocks],
                [
                  'creator.income.stories_ppv',
                  'Story PPV',
                  breakdown.storyUnlocks,
                ],
                [
                  'creator.income.messages_ppv',
                  'Locked DMs',
                  breakdown.messageUnlocks,
                ],
                ['creator.income.tips', 'Tips', breakdown.tips],
                [
                  'creator.income.live_gifts',
                  'Live gifts',
                  breakdown.liveGifts,
                ],
              ] as const
            ).map(([key, fallback, cents]) => (
              <div
                key={key}
                className="p-3 rounded-lg bg-white/3 border border-white/5"
              >
                <p className="text-[11px] text-white/50">{t(key, fallback)}</p>
                <p className="text-base font-semibold text-white tabular-nums mt-0.5">
                  €{((cents || 0) / 100).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {hasConnect && payoutsSummary ? (
        <Card variant="glass" className="p-5 space-y-3">
          <h3 className="text-sm font-medium text-white flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-brand-primary" aria-hidden />
            {t('creator.income.stripe_balances', 'Stripe balances')}
          </h3>
          <p className="text-xs text-white/50">
            {t(
              'creator.income.stripe_balances_hint',
              'Read from Stripe Connect. CircleSfera does not hold a withdrawable wallet.',
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg bg-white/3 border border-white/5">
              <p className="text-[11px] text-white/50 mb-0.5">
                {t('creator.income.available', 'Available')}
              </p>
              <p className="text-2xl font-semibold text-white tabular-nums">
                {(
                  (payoutsSummary.available?.[0]?.amountCents || 0) / 100
                ).toFixed(2)}{' '}
                <span className="text-xs font-normal text-white/40">
                  {payoutsSummary.available?.[0]?.currency || 'EUR'}
                </span>
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-white/3 border border-white/5">
              <p className="text-[11px] text-white/50 mb-0.5">
                {t('creator.income.pending', 'Pending')}
              </p>
              <p className="text-2xl font-semibold text-white tabular-nums">
                {(
                  (payoutsSummary.pending?.[0]?.amountCents || 0) / 100
                ).toFixed(2)}{' '}
                <span className="text-xs font-normal text-white/40">
                  {payoutsSummary.pending?.[0]?.currency || 'EUR'}
                </span>
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card variant="glass" className="p-5 space-y-3">
        <h3 className="text-sm font-medium text-white">
          {t('creator.income.transactions', 'Recent transactions')}
        </h3>
        <div className="space-y-2">
          {transactions.map((tx) => {
            const isIncoming = tx.receiverId === monetization?.userId;
            const isPurchase =
              tx.type.includes('UNLOCK') || tx.type.includes('SUBSCRIPTION');
            const cents = tx.amount ?? tx.amountCents ?? 0;

            return (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isIncoming
                        ? 'bg-brand-primary/15 text-brand-primary'
                        : 'bg-brand-secondary/15 text-brand-secondary'
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
                    <p className="text-sm font-medium text-white">
                      {tx.description || tx.type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[11px] text-white/40">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-sm font-medium tabular-nums ${
                    isIncoming ? 'text-white' : 'text-brand-secondary'
                  }`}
                >
                  {isIncoming ? '+' : '-'}€{(cents / 100).toFixed(2)}
                </span>
              </div>
            );
          })}

          {transactions.length === 0 && (
            <p className="text-sm text-white/50 text-center py-6">
              {t(
                'creator.income.no_transactions',
                'Sin transacciones registradas aún.',
              )}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
