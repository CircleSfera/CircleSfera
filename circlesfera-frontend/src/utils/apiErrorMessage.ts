import type { TFunction } from 'i18next';

interface ApiErrorBody {
  errorCode?: string;
  message?: string | string[];
  details?: Record<string, unknown>;
}

// A failed API call reaches the app in one of two shapes: the error the API
// client builds (`status` and `data` on the error, see handleApiError) or a
// raw Axios error (`response.status`, `response.data`). These read both.
type ErrorShape = {
  status?: number;
  data?: unknown;
  isNetworkError?: boolean;
  response?: { status?: number; data?: unknown };
};

export function apiErrorBody(error: unknown): ApiErrorBody | undefined {
  const e = error as ErrorShape | null | undefined;
  const body = e?.data ?? e?.response?.data;
  return body && typeof body === 'object' ? (body as ApiErrorBody) : undefined;
}

export function apiErrorStatus(error: unknown): number | undefined {
  const e = error as ErrorShape | null | undefined;
  return e?.status ?? e?.response?.status;
}

// The error code of a failed API call, for screens that react to a specific
// failure (for example the appeal form on a banned sign-in).
export function apiErrorCode(error: unknown): string | undefined {
  return apiErrorBody(error)?.errorCode;
}

// Extra fields some errors carry (ban reason, appeal token...).
export function apiErrorDetails(
  error: unknown,
): Record<string, unknown> | undefined {
  return apiErrorBody(error)?.details;
}

// A purchase refused because the account's identity is not verified yet. The
// server has no error code for it: it answers 403 with a Spanish sentence,
// which is the only thing that tells it apart from other refusals.
export function isIdentityVerificationRequired(error: unknown): boolean {
  if (apiErrorStatus(error) !== 403) return false;
  const body = apiErrorBody(error)?.message;
  const text =
    (error as { message?: string } | null)?.message ??
    (Array.isArray(body) ? body.join(' ') : body);
  return !!text?.includes('verificar');
}

// The message for a failed purchase or payout action: the identity notice
// when that is the reason, otherwise the usual message.
export function paymentErrorMessage(
  error: unknown,
  t: TFunction,
  fallbackKey: string,
): string {
  return isIdentityVerificationRequired(error)
    ? t('pricingPage.verification_required_desc')
    : apiErrorMessage(error, t, fallbackKey);
}

// The message to show for a failed API call, in the reader's language. The
// server's own text is never shown: it is in one language and can be
// technical. Order: the error code's text, then the kind of failure
// (offline, too many attempts, session ended, server error), then the
// screen's own message, then a generic one.
export function apiErrorMessage(
  error: unknown,
  t: TFunction,
  fallbackKey?: string,
  // On sign-in forms a 401 means wrong credentials, not an ended session.
  options: { signIn?: boolean } = {},
): string {
  const code = apiErrorCode(error);
  // The generic UNAUTHORIZED code would say the session ended; on a sign-in
  // form it means the credentials were refused, so the form's own message
  // applies.
  const useCode = code && !(options.signIn && code === 'UNAUTHORIZED');
  if (useCode) {
    const text = t(`errors.codes.${code}`, { defaultValue: '' });
    if (text) return text;
  }

  const e = error as ErrorShape | null | undefined;
  const status = apiErrorStatus(error);
  if (e?.isNetworkError) return t('errors.generic.network');
  if (status === 429) return t('errors.generic.rate_limited');
  if (status === 401 && !options.signIn) {
    return t('errors.generic.session_expired');
  }
  if (status !== undefined && status >= 500) return t('errors.generic.server');

  return fallbackKey ? t(fallbackKey) : t('errors.generic.unknown');
}
