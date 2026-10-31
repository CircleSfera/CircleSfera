import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { ArrowDownLeft, ArrowUpRight, Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { monetizationApi } from '../../services/monetization.service';
import { formatDate } from '../../utils/format';
import { formatCents } from '../../utils/money';
import CreatorEmpty from '../creator/CreatorEmpty';
import {
  CreatorFigure,
  CreatorFigures,
  CreatorRow,
  CreatorSection,
} from '../creator/CreatorPieces';
import PersonMoneyTotalSection from './PersonMoneyTotalSection';

interface Transaction {
  id: string;
  type: string;
  amountCents?: number;
  receiverId: string;
  incoming?: boolean;
  createdAt: string;
  description?: string;
  amount?: number;
  currency?: string;
}

interface MonetizationData {
  userId: string;
  lifetimeEarningsCents: number;
  // Whether a payout account is connected. The account itself stays on the
  // server.
  hasStripeAccount?: boolean;
}

// What a transaction was, in the reader's language. The stored description
// is technical (it carries payment ids) and in English, so it is only used
// for a type the app has no text for.
function transactionLabel(tx: Transaction, t: TFunction): string {
  return (
    t(`creator.income.tx_types.${tx.type}`, { defaultValue: '' }) ||
    tx.description ||
    tx.type.replace(/_/g, ' ')
  );
}

// Ledger + Stripe balances for the merged Ingresos surface. No in-app wallet.
export default function MonetizationDashboard() {
  const { t, i18n } = useTranslation();
  const { data: monetization } = useQuery<MonetizationData>({
    queryKey: ['monetization'],
    queryFn: monetizationApi.getMonetization,
  });
  const hasConnect = !!monetization?.hasStripeAccount;

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
    <div className="space-y-8">
      {breakdown ? (
        <CreatorSection
          title={t('creator.income.breakdown')}
          hint={t('creator.income.breakdown_hint')}
        >
          <CreatorFigures five>
            {(
              [
                ['creator.income.posts_ppv', breakdown.postUnlocks],
                ['creator.income.stories_ppv', breakdown.storyUnlocks],
                ['creator.income.messages_ppv', breakdown.messageUnlocks],
                ['creator.income.tips', breakdown.tips],
                ['creator.income.live_gifts', breakdown.liveGifts],
              ] as const
            ).map(([key, cents]) => (
              <CreatorFigure
                key={key}
                label={t(key)}
                value={formatCents(cents || 0, i18n.language)}
              />
            ))}
          </CreatorFigures>
        </CreatorSection>
      ) : null}

      {hasConnect && payoutsSummary ? (
        <CreatorSection
          title={t('creator.income.stripe_balances')}
          hint={t('creator.income.stripe_balances_hint')}
        >
          <CreatorFigures>
            <CreatorFigure
              label={t('creator.income.available')}
              value={formatCents(
                payoutsSummary.available?.[0]?.amountCents || 0,
                i18n.language,
                payoutsSummary.available?.[0]?.currency || 'EUR',
              )}
            />
            <CreatorFigure
              label={t('creator.income.pending')}
              value={formatCents(
                payoutsSummary.pending?.[0]?.amountCents || 0,
                i18n.language,
                payoutsSummary.pending?.[0]?.currency || 'EUR',
              )}
            />
          </CreatorFigures>
        </CreatorSection>
      ) : null}

      <CreatorSection title={t('creator.income.transactions')}>
        {transactions.length === 0 ? (
          <CreatorEmpty title={t('creator.income.no_transactions')} />
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const isIncoming =
                tx.incoming ?? tx.receiverId === monetization?.userId;
              const isPurchase =
                tx.type.includes('UNLOCK') || tx.type.includes('SUBSCRIPTION');
              const cents = tx.amount ?? tx.amountCents ?? 0;

              return (
                <CreatorRow
                  key={tx.id}
                  media={
                    isPurchase ? (
                      <Coins size={18} aria-hidden />
                    ) : isIncoming ? (
                      <ArrowDownLeft size={18} aria-hidden />
                    ) : (
                      <ArrowUpRight size={18} aria-hidden />
                    )
                  }
                  title={transactionLabel(tx, t)}
                  facts={[formatDate(tx.createdAt, i18n.language)]}
                  badge={
                    <span
                      className={`shrink-0 text-sm font-medium tabular-nums ${
                        isIncoming ? 'text-white' : 'text-brand-secondary'
                      }`}
                    >
                      {isIncoming ? '+' : '-'}
                      {formatCents(cents, i18n.language, tx.currency || 'EUR')}
                    </span>
                  }
                />
              );
            })}
          </div>
        )}
      </CreatorSection>

      <PersonMoneyTotalSection />
    </div>
  );
}
