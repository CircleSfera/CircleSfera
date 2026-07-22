import { AnimatePresence, motion } from 'framer-motion';
import { Command, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import type { Toast } from '../components/admin';
import {
  AudioTab,
  AuditLogTab,
  CommentsTab,
  ExperimentsTab,
  FirewallTab,
  HashtagsTab,
  ModerationTab,
  MonetizationTab,
  NewsletterTab,
  PostsTab,
  PromotionsTab,
  ReportsTab,
  StatsTab,
  StoriesTab,
  SystemHealthTab,
  ToastContainer,
  UsersTab,
  UserVerificationTab,
  WhitelistTab,
} from '../components/admin';
import { AdminMobileNav } from '../components/admin/AdminMobileNav';
import AdminSidebar, {
  type AdminTab as Tab,
} from '../components/admin/AdminSidebar';
import { CommandPalette } from '../components/admin/CommandPalette';
import { useAuthStore } from '../stores/authStore';

export default function Admin() {
  const { t } = useTranslation();
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const activeTab = (tab as Tab) || 'analytics';
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleTabChange = useCallback(
    (newTab: Tab) => {
      navigate(`/admin/${newTab}`);
    },
    [navigate],
  );

  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-6 lg:px-8 max-w-425 mx-auto text-gray-100">
      {/* Top Header Bar */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-black/50 backdrop-blur-2xl p-4 sm:p-5 rounded-2xl border border-white/10 relative overflow-hidden shadow-2xl">
        {/* Ambient Glow */}
        <div className="absolute top-0 left-0 w-1/3 h-full bg-linear-to-r from-brand-primary/20 via-brand-primary/5 to-transparent blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between md:justify-start gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-primary/20 rounded-xl flex items-center justify-center border border-brand-primary/30 shadow-[0_0_20px_rgba(var(--brand-primary),0.3)]">
              <ShieldCheck size={22} className="text-brand-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white tracking-tight leading-tight">
                  {t('admin.panel', 'Panel de Control')}
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-2 py-0.5 rounded-full">
                  <Sparkles size={10} /> Enterprise
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-green-400 bg-green-400/10 px-2.5 py-0.5 rounded-full border border-green-400/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Sistemas Operativos
                </span>
                <span className="text-gray-500 text-xs hidden sm:inline">
                  • {new Date().toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Command Trigger on Mobile */}
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            className="md:hidden p-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white"
            aria-label="Buscar"
          >
            <Search size={18} />
          </button>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3 relative z-10">
          {/* Global Search Trigger (Desktop) */}
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            className="hidden md:flex items-center justify-between bg-black/60 border border-white/10 text-gray-300 text-xs font-bold rounded-xl pl-3.5 pr-2.5 py-2.5 hover:bg-white/5 hover:border-white/20 transition-all w-72 shadow-inner"
          >
            <div className="flex items-center gap-2">
              <Search size={15} className="text-gray-400" />
              <span className="text-gray-400 font-normal">
                Buscar en el admin...
              </span>
            </div>
            <kbd className="flex items-center gap-1 text-[10px] font-mono font-bold border border-white/10 bg-white/10 text-gray-300 rounded px-1.5 py-0.5">
              <Command size={10} /> K
            </kbd>
          </button>

          <AdminBadge />
        </div>
      </header>

      {/* Mobile Navigation Drawer Trigger */}
      <AdminMobileNav activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Main Grid Layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Desktop Sidebar Nav */}
        <AdminSidebar activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Main Content View Container */}
        <main className="flex-1 w-full min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="bg-black/30 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl min-h-150"
            >
              {activeTab === 'analytics' && <StatsTab />}
              {activeTab === 'reports' && <ReportsTab onToast={addToast} />}
              {activeTab === 'users' && <UsersTab onToast={addToast} />}
              {activeTab === 'posts' && <PostsTab onToast={addToast} />}
              {activeTab === 'comments' && <CommentsTab onToast={addToast} />}
              {activeTab === 'hashtags' && <HashtagsTab />}
              {activeTab === 'stories' && <StoriesTab onToast={addToast} />}
              {activeTab === 'audio' && <AudioTab onToast={addToast} />}
              {activeTab === 'whitelist' && <WhitelistTab />}
              {activeTab === 'audit' && <AuditLogTab />}
              {activeTab === 'moderation' && (
                <ModerationTab onToast={addToast} />
              )}
              {activeTab === 'firewall' && <FirewallTab onToast={addToast} />}
              {activeTab === 'monetization' && <MonetizationTab />}
              {activeTab === 'promotions' && (
                <PromotionsTab onToast={addToast} />
              )}
              {activeTab === 'verification' && (
                <UserVerificationTab onToast={addToast} />
              )}
              {activeTab === 'experiments' && <ExperimentsTab />}
              {activeTab === 'newsletter' && (
                <NewsletterTab onToast={addToast} />
              )}
              {activeTab === 'system-health' && <SystemHealthTab />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} />

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </div>
  );
}

function AdminBadge() {
  const { t } = useTranslation();
  const { profile } = useAuthStore();
  if (!profile) return null;

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2 bg-brand-primary/10 border border-brand-primary/20 rounded-xl">
      <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
      <span className="text-xs text-gray-300 font-bold">
        {t('admin.connected_as', 'Admin')}:{' '}
        <span className="text-brand-primary font-black">
          @{profile.username}
        </span>
      </span>
    </div>
  );
}
