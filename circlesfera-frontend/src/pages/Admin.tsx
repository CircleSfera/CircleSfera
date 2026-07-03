import { AnimatePresence, motion } from 'framer-motion';
import { Search, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import type { Toast } from '../components/admin';
import {
  AdminSidebar,
  AudioTab,
  AuditLogTab,
  CommentsTab,
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
import type { AdminTab as Tab } from '../components/admin/AdminSidebar';
import { CommandPalette } from '../components/admin/CommandPalette';
import { useAuthStore } from '../stores/authStore';

// Removed old TABS constant as it's now handled by AdminSidebar

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
    <div className="min-h-screen px-4 py-6 md:px-6 lg:px-8 max-w-[1600px] mx-auto">
      {/* Top Navigation Bar */}
      <header className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3 glass-panel p-3 rounded-xl border border-white/5 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 left-0 w-1/3 h-full bg-brand-primary/10 blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          <div className="w-9 h-9 bg-brand-primary/20 rounded-lg flex items-center justify-center border border-brand-primary/30 shadow-[0_0_15px_rgba(var(--brand-primary),0.2)]">
            <ShieldCheck size={18} className="text-brand-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tight leading-tight">
              {t('admin.panel')}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Systems Operational
              </span>
              <span className="text-gray-500 text-xs">
                {new Date().toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 relative z-10">
          {/* Global Search Trigger */}
          <div className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setIsCommandPaletteOpen(true)}
              className="flex items-center justify-between bg-black/50 border border-white/10 text-gray-400 text-sm rounded-xl pl-3 pr-2 py-2 hover:bg-white/5 hover:border-white/20 transition-all w-64"
            >
              <div className="flex items-center">
                <Search size={16} className="mr-2 text-gray-500" />
                <span>Buscar usuarios, reportes...</span>
              </div>
              <span className="text-[10px] font-bold border border-white/10 bg-white/5 rounded px-1.5 py-0.5">
                ⌘K
              </span>
            </button>
          </div>
          <AdminBadge />
        </div>
      </header>

      {/* Layout Grid */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Sidebar Nav */}
        <AdminSidebar activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Tab Content Area */}
        <div className="flex-1 w-full lg:min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
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
              {activeTab === 'newsletter' && (
                <NewsletterTab onToast={addToast} />
              )}
              {activeTab === 'system-health' && <SystemHealthTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} />

      {/* Command Palette */}
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
    <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-brand-primary/5 border border-brand-primary/20 rounded-xl">
      <ShieldCheck size={16} className="text-brand-primary" />
      <span className="text-sm text-gray-400">
        {t('admin.connected_as')}{' '}
        <span className="text-brand-primary font-bold">
          @{profile.username}
        </span>
      </span>
    </div>
  );
}
