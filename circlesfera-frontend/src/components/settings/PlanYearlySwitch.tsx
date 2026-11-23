import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { paymentsApi } from '../../services/payments.service';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { formatCents } from '../../utils/money';
import { WithdrawalConsentBox } from '../payments/WithdrawalConsent';
import { Button, Dialog } from '../ui';
import { BUTTON_PAIR } from '../ui/buttonWidth';

interface PlanYearlySwitchProps {
  // The plan's name, its monthly and its yearly price, as the server gives
  // them.
  name: string;
  monthlyCents: number;
  yearlyCents: number;
  currency: string;
}

// A monthly plan can move to its yearly price (BD-016): what is left of the
// month already paid is credited, the year starts today and the difference
// is charged now. Two steps: the button, then a dialog that says what
// happens and asks for the year to start at once, as at checkout. When the
// card needs the person (authentication, a decline), the provider's page to
// pay opens; the plan moves once that is paid.
export default function PlanYearlySwitch({
  name,
  monthlyCents,
  yearlyCents,
  currency,
}: PlanYearlySwitchProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [consent, setConsent] = useState(false);
  const yearly = formatCents(yearlyCents, i18n.language, currency);
  const monthly = formatCents(monthlyCents, i18n.language, currency);
  const savingPercent =
    monthlyCents > 0
      ? Math.round((1 - yearlyCents / (monthlyCents * 12)) * 100)
      : 0;

  const close = () => {
    setConfirming(false);
    setConsent(false);
  };

  const mutation = useMutation({
    mutationFn: () =>
      paymentsApi.switchPlanToYearly({ withdrawalConsent: true }),
    onSuccess: (status: { pending?: boolean; paymentUrl?: string | null }) => {
      close();
      if (status?.paymentUrl) {
        window.location.href = status.paymentUrl;
        return;
      }
      queryClient.setQueryData(['billingStatus'], status);
      // A charge still being processed: the plan moves once it is paid.
      if (status?.pending) {
        toast(t('settings.billing.yearly.pending'));
        return;
      }
      toast.success(t('settings.billing.yearly.done'));
    },
    onError: (error) => {
      close();
      toast.error(apiErrorMessage(error, t, 'settings.billing.yearly.error'));
      queryClient.invalidateQueries({ queryKey: ['billingStatus'] });
    },
  });

  return (
    <div className="space-y-3" data-testid="plan-yearly-switch">
      <p className="text-sm text-white/70">
        {savingPercent > 0
          ? t('settings.billing.yearly.hint_saving', {
              yearly,
              monthly,
              percent: savingPercent,
            })
          : t('settings.billing.yearly.hint', { yearly, monthly })}
      </p>
      <Button
        variant="white"
        onClick={() => setConfirming(true)}
        className="min-h-11 button-alone text-sm font-semibold"
      >
        {t('settings.billing.yearly.open')}
      </Button>

      <Dialog
        isOpen={confirming}
        onClose={() => {
          if (!mutation.isPending) close();
        }}
        ariaLabel={t('settings.billing.yearly.title', { name })}
        maxWidth="sm"
      >
        <h2 className="mb-2 text-lg font-bold text-white">
          {t('settings.billing.yearly.title', { name })}
        </h2>
        <p className="text-sm text-white/80">
          {t('settings.billing.yearly.explain', { name, yearly })}
        </p>
        <div className="mt-3">
          <WithdrawalConsentBox
            checked={consent}
            onChange={setConsent}
            wording="plan"
          />
        </div>
        <div className={`${BUTTON_PAIR} mt-4`}>
          <Button
            variant="secondary"
            onClick={close}
            disabled={mutation.isPending}
            className="min-h-11 text-sm font-semibold"
          >
            {t('settings.billing.yearly.keep')}
          </Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            disabled={!consent}
            isLoading={mutation.isPending}
            className="min-h-11 text-sm font-semibold"
          >
            {t('settings.billing.yearly.confirm', { yearly })}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
