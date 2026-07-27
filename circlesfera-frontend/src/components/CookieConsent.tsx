import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { initSentry } from '../sentry';
import { getCookieConsent, persistCookieConsent } from '../utils/cookieConsent';

/**
 * Cookie consent banner. Persists choice to `cs_cookie_consent`.
 * Sentry is only initialized when analytics is accepted.
 */
export default function CookieConsent() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getCookieConsent() === null);
  }, []);

  const decide = useCallback((analytics: boolean) => {
    persistCookieConsent(analytics);
    if (analytics) {
      initSentry();
    }
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
      className="fixed bottom-0 inset-x-0 z-[200] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl border border-white/10 bg-black/90 backdrop-blur-xl shadow-2xl p-4 sm:p-5">
        <h2
          id="cookie-consent-title"
          className="text-sm font-bold text-white mb-1"
        >
          {t('cookieConsent.title')}
        </h2>
        <p id="cookie-consent-desc" className="text-xs text-gray-400 mb-4">
          {t('cookieConsent.description')}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => decide(false)}
            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border border-white/15 text-gray-300 hover:bg-white/5 transition-colors"
          >
            {t('cookieConsent.essential_only')}
          </button>
          <button
            type="button"
            onClick={() => decide(true)}
            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-white text-black hover:bg-gray-100 transition-colors"
          >
            {t('cookieConsent.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
