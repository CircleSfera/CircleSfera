import { Briefcase, ExternalLink, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import logoSrc from '../../assets/logo.png';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { adminPanelOrigin } from '../../utils/adminPanel';

/**
 * Home of the Backoffice: who is signed in, the way to the Admin Panel and
 * what this site is for. Its sections arrive as they move here.
 */
export default function BackofficeHome() {
  const { t } = useTranslation();
  const admin = useAdminAuthStore((state) => state.admin);
  const logout = useAdminAuthStore((state) => state.logout);

  return (
    <div className="mx-auto min-h-dvh max-w-4xl px-4 pb-8 pt-4 sm:px-6">
      <header className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-3xl p-3 sm:p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={logoSrc} alt="" className="h-7 w-auto" />
          <div className="min-w-0 leading-tight">
            <p className="text-base font-black tracking-tight text-white">
              {t('backoffice.title')}
            </p>
            {admin?.email && (
              <p className="truncate text-xs text-white/50">{admin.email}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={adminPanelOrigin()}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/8 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/18 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            {t('adminPanel.title')}
            <ExternalLink size={16} aria-hidden />
          </a>
          <button
            type="button"
            onClick={() => {
              void logout();
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/8 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/18 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <LogOut size={16} aria-hidden />
            {t('adminPanel.logout')}
          </button>
        </div>
      </header>

      <main className="glass-panel mt-4 rounded-3xl p-6 sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary">
          <Briefcase size={22} strokeWidth={1.75} aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">
          {t('backoffice.home.title')}
        </h1>
        <p className="mt-2 max-w-prose text-base leading-relaxed text-white/65">
          {t('backoffice.home.description')}
        </p>
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-white/50">
          {t('backoffice.home.sections_note')}
        </p>
      </main>
    </div>
  );
}
