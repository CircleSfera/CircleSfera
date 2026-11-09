import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  type InstantPayoutOffer,
  monetizationApi,
} from '../../services/monetization.service';
import { apiErrorCode, apiErrorMessage } from '../../utils/apiErrorMessage';
import { formatCents } from '../../utils/money';
import { Button } from '../ui';
import { BUTTON_PAIR } from '../ui/buttonWidth';
import { Dialog } from '../ui/Dialog';

export const INSTANT_PAYOUT_QUERY_KEY = ['monetization-instant-payout'];

/** The offer of an instant payout of the active Profile, from the server. */
export function useInstantPayoutOffer(enabled: boolean) {
  return useQuery<InstantPayoutOffer>({
    queryKey: INSTANT_PAYOUT_QUERY_KEY,
    queryFn: monetizationApi.getInstantPayoutOffer,
    enabled,
    retry: false,
  });
}

/**
 * "Cobrar ahora": an eligible creator takes the balance out at once, after
 * seeing the amount, the fee and what reaches the bank. The server decides
 * who may and checks again before paying out.
 */
export function InstantPayoutButton({ offer }: { offer: InstantPayoutOffer }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // One key per confirmation: a second tap, or a retry, pays out once.
  const [key, setKey] = useState('');

  const quote = offer.quote;
  const payout = useMutation({
    mutationFn: () =>
      monetizationApi.createInstantPayout(quote?.netCents ?? 0, key),
    onSuccess: (result) => {
      setOpen(false);
      toast.success(
        t('creator.income.instant.done', {
          amount: formatCents(result.netCents, i18n.language, result.currency),
        }),
      );
    },
    onError: (error: unknown) => {
      if (apiErrorCode(error) === 'INSTANT_PAYOUT_AMOUNT_CHANGED') {
        // The dialog shows the new figures once they arrive; a new
        // confirmation gets a new key.
        setKey(crypto.randomUUID());
      } else {
        setOpen(false);
      }
      toast.error(
        apiErrorMessage(error, t, 'creator.income.instant.error_generic'),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: INSTANT_PAYOUT_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['monetization-payouts'] });
    },
  });

  if (!offer.available || !quote) return null;
  const money = (cents: number) =>
    formatCents(cents, i18n.language, quote.currency);

  return (
    <>
      <Button
        variant="primary"
        size="compact"
        onClick={() => {
          setKey(crypto.randomUUID());
          setOpen(true);
        }}
      >
        {t('creator.income.instant.action')}
      </Button>
      <Dialog
        isOpen={open}
        onClose={() => {
          if (!payout.isPending) setOpen(false);
        }}
        title={t('creator.income.instant.title')}
        maxWidth="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-white/70 leading-relaxed">
            {t('creator.income.instant.intro')}
          </p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-white/60">
                {t('creator.income.instant.amount')}
              </dt>
              <dd className="text-white tabular-nums">
                {money(quote.amountCents)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-white/60">
                {t('creator.income.instant.fee')}
              </dt>
              <dd className="text-white tabular-nums">
                −{money(quote.feeCents)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-white/10 pt-2 font-semibold">
              <dt className="text-white">{t('creator.income.instant.net')}</dt>
              <dd className="text-white tabular-nums">
                {money(quote.netCents)}
              </dd>
            </div>
          </dl>
          <div className={BUTTON_PAIR}>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => setOpen(false)}
              disabled={payout.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              className="min-h-11"
              isLoading={payout.isPending}
              disabled={payout.isPending}
              onClick={() => payout.mutate()}
            >
              {t('creator.income.instant.confirm', {
                amount: money(quote.netCents),
              })}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/**
 * What a Profile still needs before it is offered instant payouts, so the
 * rule is never hidden.
 */
export function InstantPayoutRequirements({
  offer,
}: {
  offer: InstantPayoutOffer;
}) {
  const { t } = useTranslation();
  const record = offer.trackRecord;
  if (offer.reason !== 'TRACK_RECORD' || !record) return null;
  return (
    <p className="mt-3 text-xs text-white/50 leading-relaxed">
      {t('creator.income.instant.requirements', {
        days: record.minDaysSinceFirstSale,
        sales: record.minSales,
        disputeDays: record.disputeFreeDays,
      })}{' '}
      {t('creator.income.instant.progress', {
        days: record.daysSinceFirstSale ?? 0,
        count: record.sales,
      })}
    </p>
  );
}
