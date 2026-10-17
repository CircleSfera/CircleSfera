import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog } from '../ui';
import { BUTTON_FIT, BUTTON_ROW } from '../ui/buttonWidth';

/**
 * What the server asks of every purchase of digital content or a plan: the
 * buyer consents to start at once and acknowledges losing the 14-day right of
 * withdrawal. Only this box, once ticked, makes one.
 */
export interface WithdrawalConsentGiven {
  withdrawalConsent: true;
}

/** The box, unticked until the person ticks it. */
export function WithdrawalConsentBox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-gray-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-brand-primary"
      />
      <span>{t('payments.withdrawal.consent')}</span>
    </label>
  );
}

/**
 * Asks for the consent before a purchase starts. `ask` opens the dialog;
 * only "Continue" with the box ticked runs the purchase, with the consent.
 */
export function useWithdrawalConsent() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<
    ((given: WithdrawalConsentGiven) => void) | null
  >(null);
  const [checked, setChecked] = useState(false);

  const close = () => {
    setPending(null);
    setChecked(false);
  };

  const ask = (run: (given: WithdrawalConsentGiven) => void) => {
    setChecked(false);
    setPending(() => run);
  };

  const dialog = (
    <Dialog
      isOpen={pending !== null}
      onClose={close}
      ariaLabel={t('payments.withdrawal.title')}
      maxWidth="sm"
    >
      <h2 className="mb-2 text-lg font-bold text-white">
        {t('payments.withdrawal.title')}
      </h2>
      <WithdrawalConsentBox checked={checked} onChange={setChecked} />
      <p className="mt-2 text-xs text-gray-400">
        {t('payments.withdrawal.required')}
      </p>
      <div className={`${BUTTON_ROW} mt-4`}>
        <Button
          type="button"
          variant="primary"
          disabled={!checked}
          className={BUTTON_FIT}
          onClick={() => {
            const run = pending;
            close();
            run?.({ withdrawalConsent: true });
          }}
        >
          {t('payments.withdrawal.continue')}
        </Button>
      </div>
    </Dialog>
  );

  return { ask, dialog };
}
