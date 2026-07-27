const STORAGE_KEY = 'cs_cookie_consent';

export type CookieConsentState = {
  necessary: true;
  analytics: boolean;
  updatedAt: string;
};

export function getCookieConsent(): CookieConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsentState;
    if (parsed?.necessary !== true || typeof parsed.analytics !== 'boolean') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function persistCookieConsent(analytics: boolean): CookieConsentState {
  const state: CookieConsentState = {
    necessary: true,
    analytics,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}
