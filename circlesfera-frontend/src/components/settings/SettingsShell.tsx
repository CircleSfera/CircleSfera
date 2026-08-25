import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';
import {
  findSettingsNavItem,
  SETTINGS_NAV_GROUPS,
  type SettingsSectionId,
} from './settingsNav';

interface SettingsShellProps {
  section: SettingsSectionId | null;
  children: React.ReactNode;
}

export default function SettingsShell({
  section,
  children,
}: SettingsShellProps) {
  const { t } = useTranslation();
  const mainRef = useRef<HTMLElement>(null);
  const navItem = section ? findSettingsNavItem(section) : null;
  const title = navItem
    ? t(navItem.labelKey, navItem.labelFallback)
    : t('settings.hub.title', 'Your account');
  const isHub = section === null;

  // Focus main when navigating between hub index and sections (a11y).
  // biome-ignore lint/correctness/useExhaustiveDependencies: section is the intentional trigger
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [section]);

  return (
    <div className="min-h-dvh pb-20 md:pb-12 pt-2 md:pt-6">
      <div
        data-testid="settings-column"
        className={`px-4 md:px-6 ${isHub ? 'max-w-xl mx-auto' : 'max-w-5xl'}`}
      >
        {/* Page header */}
        <div className="mb-4 md:mb-6 flex items-center gap-3">
          {section ? (
            <Link
              to="/accounts"
              className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white shrink-0"
              aria-label={t('settings.hub.back', 'Back to account')}
            >
              <ArrowLeft size={20} />
            </Link>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-white tracking-tight truncate">
              {title}
            </h1>
            {!section && (
              <p className="text-sm text-white/50 mt-0.5">
                {t(
                  'settings.hub.subtitle',
                  'Manage your CircleSfera experience',
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          {/* Desktop sidebar — only on section pages */}
          {!isHub && (
            <nav
              aria-label={t('settings.hub.nav_label', 'Account settings')}
              className="hidden md:block w-56 shrink-0"
            >
              <div className="sticky top-24 space-y-5">
                {SETTINGS_NAV_GROUPS.map((group) => (
                  <div key={group.id}>
                    <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-1.5 px-2">
                      {t(group.labelKey, group.labelFallback)}
                    </p>
                    <ul className="space-y-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <li key={item.id}>
                            <NavLink
                              to={`/accounts/${item.id}`}
                              className={({ isActive }) =>
                                `flex items-center gap-2.5 px-2.5 py-2 min-h-11 rounded-lg text-sm transition-colors ${
                                  isActive
                                    ? 'bg-brand-primary/15 text-white font-medium'
                                    : 'text-white/60 hover:text-white hover:bg-white/5'
                                }`
                              }
                            >
                              {({ isActive }) => (
                                <>
                                  <Icon
                                    size={18}
                                    className={
                                      isActive
                                        ? 'text-brand-primary'
                                        : 'text-white/40'
                                    }
                                    aria-hidden
                                  />
                                  <span className="truncate">
                                    {t(item.labelKey, item.labelFallback)}
                                  </span>
                                </>
                              )}
                            </NavLink>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </nav>
          )}

          <main
            ref={mainRef}
            tabIndex={-1}
            id="settings-main"
            className="flex-1 min-w-0 outline-none"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
