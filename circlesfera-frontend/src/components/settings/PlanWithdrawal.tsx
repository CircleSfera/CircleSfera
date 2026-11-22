import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { Button, Dialog } from '../ui';
import { BUTTON_PAIR } from '../ui/buttonWidth';

interface PlanWithdrawalProps {
  // What is withdrawn from, as the person knows it (the plan's name, or
  // Edits Studio Pro).
  name: string;
  // The last moment of the 14 days, as the server gives it.
  until: string;
  // The request that withdraws; the server checks the 14 days and who pays.
  withdraw: () => Promise<unknown>;
}

// Within 14 days of buying a plan (or the Edits Studio Pro add-on) the
// person can withdraw from the contract here (PD-023): it ends now, its
// features stop now, and the unused part is refunded to the card. Two steps:
// the link, then a dialog that says what happens.
export default function PlanWithdrawal({
  name,
  until,
  withdraw,
}: PlanWithdrawalProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const lastDay = new Date(until).toLocaleDateString(i18n.language, {
    dateStyle: 'long',
  });

  const mutation = useMutation({
    mutationFn: withdraw,
    onSuccess: () => {
      setConfirming(false);
      toast.success(t('settings.billing.withdrawal.done'));
    },
    onError: (error) => {
      setConfirming(false);
      toast.error(
        apiErrorMessage(error, t, 'settings.billing.withdrawal.error'),
      );
    },
    // Asked again either way: a refused withdrawal may mean the 14 days
    // have just passed.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['billingStatus'] }),
  });

  return (
    <div className="space-y-3" data-testid="plan-withdrawal">
      <p className="text-sm text-white/70">
        {t('settings.billing.withdrawal.hint', { date: lastDay })}
      </p>
      <Button
        variant="secondary"
        onClick={() => setConfirming(true)}
        className="min-h-11 button-alone text-sm font-semibold"
      >
        {t('settings.billing.withdrawal.open')}
      </Button>

      <Dialog
        isOpen={confirming}
        onClose={() => {
          if (!mutation.isPending) setConfirming(false);
        }}
        ariaLabel={t('settings.billing.withdrawal.title')}
        maxWidth="sm"
      >
        <h2 className="mb-2 text-lg font-bold text-white">
          {t('settings.billing.withdrawal.title')}
        </h2>
        <p className="text-sm text-white/80">
          {t('settings.billing.withdrawal.explain', { name })}
        </p>
        <div className={`${BUTTON_PAIR} mt-4`}>
          <Button
            variant="secondary"
            onClick={() => setConfirming(false)}
            disabled={mutation.isPending}
            className="min-h-11 text-sm font-semibold"
          >
            {t('settings.billing.withdrawal.keep')}
          </Button>
          <Button
            variant="danger"
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            className="min-h-11 text-sm font-semibold"
          >
            {t('settings.billing.withdrawal.confirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
