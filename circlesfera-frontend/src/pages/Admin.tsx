import { AnimatePresence, motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Toast } from '../components/admin';
import {
  AdminSidebar,
  AudioTab,
  AuditLogTab,
  CommentsTab,
  HashtagsTab,
  ModerationTab,
  MonetizationTab,
  NewsletterTab,
  PostsTab,
  PromotionsTab,
  ReportsTab,
  StatsTab,
  StoriesTab,
  ToastContainer,
  UsersTab,
  UserVerificationTab,
  WhitelistTab,
} from '../components/admin';
import type { AdminTab as Tab } from '../components/admin/AdminSidebar';
import { useAuthStore } from '../stores/authStore';

// Removed old TABS constant as it's now handled by AdminSidebar

export default function Admin() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('analytics');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <div className="min-h-screen bg-black px-4 py-6 md:px-6 lg:px-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {t('admin.panel')}
          </h1>
          <p className="text-gray-500 mt-0.5 text-xs">
            {t('admin.description')}
          </p>
        </div>
        <AdminBadge />
      </header>

      {/* Layout Grid */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Sidebar Nav */}
        <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />

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
              {activeTab === 'monetization' && <MonetizationTab />}
              {activeTab === 'promotions' && (
                <PromotionsTab onToast={addToast} />
              )}
              {activeTab === 'verification' && <UserVerificationTab />}
              {activeTab === 'newsletter' && (
                <NewsletterTab onToast={addToast} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} />
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
