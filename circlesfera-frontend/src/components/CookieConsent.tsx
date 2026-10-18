import { AnimatePresence, motion } from 'framer-motion';
import { Cookie, ShieldCheck, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { initSentry } from '../sentry';
import { getCookieConsent, persistCookieConsent } from '../utils/cookieConsent';

// Cookie consent banner. Persists choice to `cs_cookie_consent`.
// Sentry is only initialized when analytics is accepted.
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
        // Fades in where it stays, above the bottom edge: a fixed card that
        // slides up from the edge makes Safari on iPhone paint a solid strip
        // behind its address bar.
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          role="dialog"
          aria-labelledby="cookie-consent-title"
          aria-describedby="cookie-consent-desc"
          className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-200 pointer-events-none"
        >
          <div
            className="pointer-events-auto mx-auto max-w-lg rounded-2xl p-4 sm:p-5 relative overflow-hidden"
            style={{
              background:
                'linear-gradient(160deg, rgba(16,10,28,0.95) 0%, rgba(10,7,18,0.97) 100%)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid rgba(136, 76, 255,0.18)',
              boxShadow:
                '0 -4px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(136, 76, 255,0.06), inset 0 1px 0 rgba(255,255,255,0.06)',
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
                    'linear-gradient(135deg, rgba(136, 76, 255,0.2), rgba(64,93,230,0.12))',
                  border: '1px solid rgba(136, 76, 255,0.25)',
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
                  className="text-xs text-gray-400 leading-relaxed"
                >
                  {t('cookieConsent.description')}
                </p>
              </div>

              {/* Dismiss */}
              <motion.button
                type="button"
                onClick={() => decide(false)}
                whileTap={{ scale: 0.9 }}
                className="shrink-0 w-11 h-11 -mr-2 -mt-2 rounded-xl flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/8 transition-all"
                aria-label={t('cookieConsent.dismiss')}
              >
                <X size={16} />
              </motion.button>
            </div>

            {/* Side by side, the same height: saying no is as easy and as
                visible as saying yes. Halves of the card on a phone;
                centred, each as wide as the other, on a wider screen. */}
            <div className="grid grid-cols-2 gap-2 mt-4 sm:flex sm:justify-center">
              <button
                type="button"
                onClick={() => decide(false)}
                className="h-11 flex items-center justify-center gap-1.5 px-3 sm:w-44 rounded-xl text-sm font-semibold text-white hover:bg-white/10 transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                }}
              >
                <ShieldCheck size={16} className="shrink-0" />
                <span className="truncate">
                  {t('cookieConsent.essential_only')}
                </span>
              </button>
              <motion.button
                type="button"
                onClick={() => decide(true)}
                whileTap={{ scale: 0.97 }}
                className="h-11 flex items-center justify-center px-3 sm:w-44 rounded-xl text-sm font-semibold text-white"
                style={{
                  background:
                    'linear-gradient(90deg, #ff5757 0%, #884cff 100%)',
                }}
              >
                <span className="truncate">{t('cookieConsent.accept')}</span>
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
