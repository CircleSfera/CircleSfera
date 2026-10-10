import type { TFunction } from 'i18next';
import { apiErrorCode } from './apiErrorMessage';

/** Which field of the form a refusal is about. */
export type SignInErrorField = 'email' | 'currentPassword' | 'form';

const FIELD_OF: Record<string, SignInErrorField> = {
  SIGN_IN_EMAIL_TAKEN: 'email',
  SIGN_IN_PROOF_INVALID: 'currentPassword',
  SIGN_IN_PROOF_REQUIRED: 'currentPassword',
};

const KNOWN = new Set([
  'SIGN_IN_EMAIL_TAKEN',
  'SIGN_IN_PROOF_INVALID',
  'SIGN_IN_PROOF_REQUIRED',
  'SIGN_IN_ALREADY_OWN',
  'SIGN_IN_NOT_FOUND',
  'SIGN_IN_LIMIT_REACHED',
]);

/**
 * Why a change to how a Profile signs in was refused, in the reader's
 * language, and the field it belongs next to.
 */
export function signInError(
  error: unknown,
  t: TFunction,
): { field: SignInErrorField; message: string } {
  const code = apiErrorCode(error);
  if (code && KNOWN.has(code)) {
    return {
      field: FIELD_OF[code] ?? 'form',
      message: t(`settings.signIns.errors.${code}`),
    };
  }
  return { field: 'form', message: t('settings.signIns.errors.generic') };
}
