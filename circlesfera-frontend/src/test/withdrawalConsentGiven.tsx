import type { WithdrawalConsentGiven } from '../components/payments/WithdrawalConsent';

/**
 * For screen tests about what a purchase does after the consent: the
 * consent dialog is taken as accepted at once. The dialog itself is tested in
 * WithdrawalConsent.test.tsx and PostMedia.test.tsx.
 */
export const withdrawalConsentGiven = () => ({
  useWithdrawalConsent: () => ({
    ask: (run: (given: WithdrawalConsentGiven) => void) =>
      run({ withdrawalConsent: true }),
    dialog: null,
  }),
});
