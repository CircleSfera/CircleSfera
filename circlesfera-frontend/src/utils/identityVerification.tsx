import type { TFunction } from 'i18next';
import { toast } from 'react-hot-toast';
import { usersApi } from '../services/users.service';
import {
  apiErrorMessage,
  isIdentityVerificationRequired,
} from './apiErrorMessage';

// Tells the person their identity must be verified before buying or getting
// paid, with a button that opens the verification and returns to this page.
export function promptIdentityVerification(t: TFunction): void {
  toast(
    (toastItem) => (
      <div className="flex flex-col gap-2 p-1 text-left">
        <span className="font-bold text-sm text-zinc-900">
          {t('pricingPage.verification_required_title')}
        </span>
        <span className="text-xs text-zinc-600">
          {t('pricingPage.verification_required_desc')}
        </span>
        <button
          type="button"
          className="bg-brand-primary text-white text-xs font-bold py-2.5 min-h-11 px-3 rounded-lg mt-1 hover:bg-brand-primary/95 transition-all"
          onClick={async () => {
            toast.dismiss(toastItem.id);
            try {
              const res = await usersApi.createIdentitySession(
                window.location.href,
              );
              if (res.url) {
                window.location.href = res.url;
              }
            } catch {
              toast.error(t('pricingPage.verify_error'));
            }
          }}
        >
          {t('pricingPage.verify_button')}
        </button>
      </div>
    ),
    { duration: 8000 },
  );
}

// Reports a failed purchase or payout action: the verification notice when
// that is the reason, otherwise the screen's own message.
export function reportPaymentError(
  error: unknown,
  t: TFunction,
  fallbackKey: string,
): void {
  if (isIdentityVerificationRequired(error)) {
    promptIdentityVerification(t);
    return;
  }
  toast.error(apiErrorMessage(error, t, fallbackKey));
}
