import { Menu, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';
import { useAuthStore } from '../../stores/authStore';
import { MarketingCTA } from './MarketingCTA';

interface GuestAppChromeProps {
  showLinks?: boolean;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'h-9 px-4 inline-flex items-center text-[13px] font-semibold rounded-full transition-all duration-300',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50',
    isActive
      ? 'text-white bg-white/10'
      : 'text-white/60 hover:text-white hover:bg-white/5',
  ].join(' ');

/**
 * Guest top chrome — Full width, solid/blur background, refined typography.
 */
export function GuestAppChrome({ showLinks = true }: GuestAppChromeProps) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  if (isAuthenticated) return null;

  const navLinks = [
    { to: '/explore', label: t('common.footer.explore') },
    { to: '/features', label: t('landing.footer.features') },
    { to: '/support', label: t('common.footer.support') },
  ] as const;

  return (
    <header
      className="absolute top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-white/5 transition-colors duration-300"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div
        className="flex items-center justify-between px-4 sm:px-6 max-w-7xl mx-auto"
        style={{ height: 'var(--nav-top-height, 60px)' }}
      >
        <Link
          to="/"
          onClick={closeMenu}
          className="flex items-center gap-2 min-w-0 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 rounded-lg"
          aria-label="CircleSfera"
        >
          <img
            src={logoSrc}
            alt=""
            className="h-6 w-auto object-contain"
            aria-hidden
          />
          <span className="text-sm sm:text-base font-black tracking-tight truncate bg-clip-text text-transparent bg-linear-to-b from-white to-white/70">
            CircleSfera
          </span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {showLinks && (
            <nav
              className="hidden md:flex items-center gap-1 mr-2"
              aria-label={t('landing.nav.primary')}
            >
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={closeMenu}
                  className={navLinkClass}
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          )}

          <Link
            to="/accounts/login"
            onClick={closeMenu}
            className="hidden sm:inline-flex h-9 px-4 items-center text-[13px] font-semibold text-white/70 hover:text-white transition-colors rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
          >
            {t('landing.nav.log_in')}
          </Link>

          <MarketingCTA
            to="/accounts/emailsignup"
            variant="white"
            size="md"
            className="px-5 h-9 text-[13px] rounded-full font-bold shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all duration-300"
          >
            {t('landing.nav.sign_up')}
          </MarketingCTA>

          {showLinks && (
            <button
              type="button"
              className="md:hidden ml-1 w-9 h-9 inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors focus:outline-none"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={
                menuOpen
                  ? t('landing.nav.close_menu')
                  : t('landing.nav.open_menu')
              }
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? (
                <X className="w-5 h-5" aria-hidden />
              ) : (
                <Menu className="w-5 h-5" aria-hidden />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {showLinks && menuOpen && (
        <nav
          id={menuId}
          className="md:hidden border-t border-white/5 bg-black px-4 py-4 flex flex-col gap-1 shadow-2xl"
          aria-label={t('landing.nav.primary')}
        >
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={closeMenu}
              className={({ isActive }) =>
                [
                  'flex items-center h-12 px-4 rounded-xl text-[14px] font-semibold transition-colors',
                  isActive
                    ? 'text-white bg-white/10'
                    : 'text-white/70 hover:text-white hover:bg-white/5',
                ].join(' ')
              }
            >
              {link.label}
            </NavLink>
          ))}
          <div className="h-px bg-white/10 my-2 mx-2" />
          <Link
            to="/accounts/login"
            onClick={closeMenu}
            className="flex items-center h-12 px-4 rounded-xl text-[14px] font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
          >
            {t('landing.nav.log_in')}
          </Link>
        </nav>
      )}
    </header>
  );
}
