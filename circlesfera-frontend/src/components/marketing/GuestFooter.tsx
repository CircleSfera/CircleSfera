import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';
import { MarketingCTA } from './MarketingCTA';

/** Guest footer — brand + sitemap. Four columns on desktop, stacked on mobile. */
export function GuestFooter() {
  const { t } = useTranslation();

  const columns = [
    {
      title: t('landing.footer.platform'),
      links: [
        { to: '/explore', label: t('common.footer.explore') },
        { to: '/pricing', label: t('common.footer.pricing') },
        { to: '/support', label: t('common.footer.support') },
      ],
    },
    {
      title: t('landing.footer.product'),
      links: [
        { to: '/features', label: t('landing.footer.features') },
        { to: '/principles', label: t('landing.footer.principles') },
        { to: '/faq', label: t('landing.faq.badge') },
      ],
    },
    {
      title: t('landing.footer.legal'),
      links: [
        { to: '/privacy', label: t('common.footer.privacy') },
        { to: '/terms', label: t('common.footer.terms') },
        { to: '/guidelines', label: t('common.footer.guidelines') },
      ],
    },
    {
      title: t('landing.footer.account'),
      links: [
        { to: '/accounts/login', label: t('common.footer.login') },
        { to: '/accounts/signup', label: t('common.footer.signup') },
      ],
    },
  ] as const;

  return (
    <footer className="mt-auto border-t border-white/8 pb-[env(safe-area-inset-bottom)] bg-surface-elevated/80">
      <div className="mx-auto max-w-6xl px-4 sm:px-5 py-8 sm:py-10">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          <div className="lg:max-w-xs shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <img
                src={logoSrc}
                alt=""
                className="h-6 w-auto object-contain"
                aria-hidden
              />
              <span className="brand-wordmark text-base font-black tracking-tight">
                CircleSfera
              </span>
            </div>
            <p className="text-sm text-white/50 leading-relaxed mb-4">
              {t('landing.footer.desc')}
            </p>
            <MarketingCTA to="/accounts/signup" variant="primary" size="md">
              {t('landing.nav.sign_up')}
            </MarketingCTA>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 flex-1">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                  {col.title}
                </h3>
                <ul className="space-y-0.5">
                  {col.links.map((link) => (
                    <li key={link.to}>
                      <Link
                        to={link.to}
                        className="inline-flex items-center min-h-11 text-sm text-white/60 hover:text-white transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-5 border-t border-white/8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-white/35">{t('landing.footer.rights')}</p>
          <p className="text-xs text-white/30">{t('landing.footer.tagline')}</p>
        </div>
      </div>
    </footer>
  );
}
