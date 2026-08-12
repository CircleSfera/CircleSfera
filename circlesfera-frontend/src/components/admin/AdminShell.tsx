import { Command, Menu, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { AdminMobileDrawer } from './AdminMobileNav';
import AdminSidebar from './AdminSidebar';
import type { AdminTab } from './adminNav';
import { findAdminNavItem } from './adminNav';
import { CommandPalette } from './CommandPalette';

interface AdminShellProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  children: React.ReactNode;
}

export default function AdminShell({
  activeTab,
  onTabChange,
  children,
}: AdminShellProps) {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const activeItem = findAdminNavItem(activeTab);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-dvh px-3 pb-8 pt-3 sm:px-6 sm:pt-6 lg:px-8 max-w-425 mx-auto text-white">
      <header className="mb-4 sm:mb-6 pt-[env(safe-area-inset-top)] sm:pt-0">
        <div className="flex items-center justify-between gap-3 bg-white/3 backdrop-blur-xl p-3 sm:p-4 rounded-xl border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1/3 h-full bg-linear-to-r from-brand-primary/15 via-transparent to-transparent pointer-events-none" />

          <div className="flex items-center gap-3 min-w-0 relative z-10">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white shrink-0"
              aria-label={t('admin.open_nav', 'Abrir navegación')}
            >
              <Menu size={20} />
            </button>

            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-brand-primary/20 rounded-xl flex items-center justify-center border border-brand-primary/30 shrink-0">
              <ShieldCheck size={20} className="text-brand-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold text-white tracking-tight leading-tight truncate">
                {t('admin.panel', 'Panel de Control')}
              </h1>
              <p className="text-xs text-white/40 truncate lg:hidden">
                {activeItem
                  ? t(activeItem.labelKey, activeItem.labelFallback)
                  : activeTab}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 relative z-10">
            <Link
              to="/"
              className="lg:hidden text-xs font-semibold text-white/50 hover:text-white min-h-11 px-2 inline-flex items-center"
            >
              {t('admin.back_short', 'App')}
            </Link>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="w-11 h-11 md:w-auto md:h-auto md:px-4 md:py-3 flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white/70 text-xs font-semibold rounded-xl hover:bg-white/10 hover:border-white/20 transition-all"
              aria-label={t('admin.search', 'Buscar')}
            >
              <Search size={16} />
              <span className="hidden md:inline text-white/50 font-normal">
                {t('admin.search_placeholder', 'Buscar en el admin...')}
              </span>
              <kbd className="hidden md:flex items-center gap-1 text-[10px] font-mono font-bold border border-white/10 bg-white/10 text-white/70 rounded px-1.5 py-0.5">
                <Command size={10} /> K
              </kbd>
            </button>
            <AdminBadge />
          </div>
        </div>
      </header>

      <AdminMobileDrawer
        activeTab={activeTab}
        onTabChange={onTabChange}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
        <AdminSidebar activeTab={activeTab} onTabChange={onTabChange} />
        <main className="flex-1 w-full min-w-0">{children}</main>
      </div>

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}

function AdminBadge() {
  const { t } = useTranslation();
  const profile = useAuthStore((state) => state.profile);
  if (!profile) return null;

  return (
    <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-brand-primary/10 border border-brand-primary/20 rounded-xl">
      <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
      <span className="text-xs text-white/70 font-semibold">
        {t('admin.connected_as', 'Admin')}:{' '}
        <span className="text-brand-primary font-bold">
          @{profile.username}
        </span>
      </span>
    </div>
  );
}
