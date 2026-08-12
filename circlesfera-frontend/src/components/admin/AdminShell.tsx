import {
  Command,
  ExternalLink,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import logoSrc from '../../assets/logo.png';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { platformOrigin } from '../../utils/adminPanel';
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
    <div className="min-h-dvh px-3 pb-5 pt-3 sm:px-5 sm:pt-4 sm:pb-6 lg:px-6 lg:pt-5 max-w-425 mx-auto text-white">
      <header className="mb-4 lg:mb-5 pt-[env(safe-area-inset-top)] sm:pt-0 relative z-40">
        <div className="flex items-center justify-between gap-3 glass-panel p-2.5 sm:p-3 rounded-xl relative">
          {/* Clip only the decorative wash — keep header overflow visible for account menu */}
          <div
            className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none"
            aria-hidden
          >
            <div className="absolute top-0 left-0 w-1/3 h-full bg-linear-to-r from-brand-primary/15 via-transparent to-transparent" />
          </div>

          <div className="flex items-center gap-2.5 min-w-0 relative z-10">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden w-11 h-11 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white shrink-0"
              aria-label={t('admin.open_nav', 'Abrir navegación')}
            >
              <Menu size={20} />
            </button>

            <img
              src={logoSrc}
              alt="CircleSfera"
              className="h-6 w-auto sm:h-7 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-white tracking-tight leading-tight truncate">
                  {t('adminPanel.title', 'Admin Panel')}
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-brand-primary/15 border border-brand-primary/25 shrink-0">
                  <ShieldCheck size={10} className="text-brand-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary">
                    {t('adminPanel.staff', 'Staff')}
                  </span>
                </span>
              </div>
              <p className="text-[11px] text-white/40 truncate leading-tight">
                {activeItem
                  ? t(activeItem.labelKey, activeItem.labelFallback)
                  : activeTab}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 relative z-10">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="w-11 h-11 md:w-auto md:h-auto md:px-3 md:py-2 flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white/70 text-xs font-semibold rounded-lg hover:bg-white/10 hover:border-white/20 transition-all"
              aria-label={t('admin.search')}
            >
              <Search size={16} />
              <span className="hidden md:inline text-white/50 font-normal">
                {t('admin.search_placeholder')}
              </span>
              <kbd className="hidden md:flex items-center gap-1 text-[10px] font-mono font-bold border border-white/10 bg-white/10 text-white/70 rounded px-1.5 py-0.5">
                <Command size={10} /> K
              </kbd>
            </button>
            <AdminAccountMenu />
          </div>
        </div>
      </header>

      <AdminMobileDrawer
        activeTab={activeTab}
        onTabChange={onTabChange}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-start">
        <AdminSidebar activeTab={activeTab} onTabChange={onTabChange} />
        <main className="flex-1 w-full min-w-0 space-y-1">{children}</main>
      </div>

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}

function AdminAccountMenu() {
  const { t } = useTranslation();
  const admin = useAdminAuthStore((state) => state.admin);
  const logout = useAdminAuthStore((state) => state.logout);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!admin) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 max-w-40 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all min-h-9"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="w-7 h-7 rounded-lg bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center shrink-0">
          <ShieldCheck size={14} className="text-brand-primary" />
        </span>
        <span className="hidden sm:block text-xs font-semibold text-white truncate">
          {admin.displayName}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/10 bg-surface-raised shadow-2xl overflow-hidden z-[100]"
        >
          <div className="px-3 py-2.5 border-b border-white/10 bg-surface-elevated">
            <p className="text-xs font-semibold text-white truncate">
              {admin.displayName}
            </p>
            <p className="text-[11px] text-white/50 truncate">{admin.email}</p>
          </div>
          <a
            href={platformOrigin()}
            role="menuitem"
            className="flex items-center gap-2.5 px-3 py-2.5 min-h-11 text-xs font-semibold text-white/80 hover:bg-white/5 hover:text-white"
          >
            <ExternalLink size={14} className="text-brand-primary shrink-0" />
            {t('admin.back_to_app', 'Volver a CircleSfera')}
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              void logout().then(() => {
                window.location.href = '/login';
              })
            }
            className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-11 text-xs font-semibold text-white/80 hover:bg-white/5 hover:text-white text-left"
          >
            <LogOut size={14} className="text-brand-primary shrink-0" />
            {t('adminPanel.logout', 'Sign out')}
          </button>
        </div>
      )}
    </div>
  );
}
