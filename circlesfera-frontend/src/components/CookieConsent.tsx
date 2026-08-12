import { AnimatePresence, motion } from 'framer-motion';
import { Cookie, ShieldCheck, X } from 'lucide-react';
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

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          role="dialog"
          aria-labelledby="cookie-consent-title"
          aria-describedby="cookie-consent-desc"
          className="fixed bottom-0 inset-x-0 z-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pointer-events-none"
        >
          <div
            className="pointer-events-auto mx-auto max-w-lg rounded-2xl p-4 sm:p-5 relative overflow-hidden"
            style={{
              background:
                'linear-gradient(160deg, rgba(16,10,28,0.95) 0%, rgba(10,7,18,0.97) 100%)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid rgba(140, 82, 255,0.18)',
              boxShadow:
                '0 -4px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(140, 82, 255,0.06), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {/* Brand accent top bar */}
            <div
              className="absolute top-0 left-0 right-0 h-0.5"
              style={{
                background:
                  'linear-gradient(90deg, var(--brand-primary), var(--brand-secondary), var(--brand-accent))',
                opacity: 0.8,
              }}
            />

            <div className="flex items-start gap-3">
              {/* Icon */}
              <div
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(140, 82, 255,0.2), rgba(64,93,230,0.12))',
                  border: '1px solid rgba(140, 82, 255,0.25)',
                }}
              >
                <Cookie size={16} className="text-purple-300" />
              </div>

              <div className="flex-1 min-w-0">
                <h2
                  id="cookie-consent-title"
                  className="text-sm font-bold text-white mb-0.5 tracking-tight"
                >
                  {t('cookieConsent.title')}
                </h2>
                <p
                  id="cookie-consent-desc"
                  className="text-xs text-gray-400 leading-relaxed mb-4"
                >
                  {t('cookieConsent.description')}
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => decide(false)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <ShieldCheck size={13} />
                    {t('cookieConsent.essential_only')}
                  </button>
                  <motion.button
                    type="button"
                    onClick={() => decide(true)}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex-1 sm:flex-initial px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-white transition-all"
                    style={{
                      background:
                        'linear-gradient(90deg, #ff5757 0%, #8c52ff 100%)',
                      boxShadow:
                        '0 4px 16px rgba(140,82,255,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                    }}
                  >
                    {t('cookieConsent.accept')}
                  </motion.button>
                </div>
              </div>

              {/* Dismiss */}
              <motion.button
                type="button"
                onClick={() => decide(false)}
                whileTap={{ scale: 0.9 }}
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/8 transition-all mt-0.5"
                aria-label="Dismiss"
              >
                <X size={14} />
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
