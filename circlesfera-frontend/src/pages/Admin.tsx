import { AnimatePresence, motion } from 'framer-motion';
import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AppealsTab,
  AudioTab,
  AuditLogTab,
  CommentsTab,
  ExperimentsTab,
  FirewallTab,
  HashtagsTab,
  LiveStreamsTab,
  ModerationTab,
  MonetizationTab,
  NewsletterTab,
  PostsTab,
  PromotionsTab,
  ReportsTab,
  StatsTab,
  StoriesTab,
  SupportTicketsTab,
  SystemHealthTab,
  TrustTab,
  UsersTab,
  UserVerificationTab,
  WhitelistTab,
} from '../components/admin';
import AdminShell from '../components/admin/AdminShell';
import type { AdminTab } from '../components/admin/adminNav';
import { adminToast } from '../components/admin/adminToast';

export default function Admin() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const activeTab = (tab as AdminTab) || 'analytics';

  const handleTabChange = useCallback(
    (newTab: AdminTab) => {
      navigate(`/admin/${newTab}`);
    },
    [navigate],
  );

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    adminToast(message, type);
  }, []);

  return (
    <AdminShell activeTab={activeTab} onTabChange={handleTabChange}>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="bg-black/30 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 sm:p-5 lg:p-6 shadow-2xl min-h-0"
        >
          {activeTab === 'analytics' && <StatsTab />}
          {activeTab === 'reports' && <ReportsTab onToast={addToast} />}
          {activeTab === 'users' && <UsersTab onToast={addToast} />}
          {activeTab === 'posts' && <PostsTab onToast={addToast} />}
          {activeTab === 'comments' && <CommentsTab onToast={addToast} />}
          {activeTab === 'hashtags' && <HashtagsTab />}
          {activeTab === 'stories' && <StoriesTab onToast={addToast} />}
          {activeTab === 'live' && <LiveStreamsTab onToast={addToast} />}
          {activeTab === 'audio' && <AudioTab onToast={addToast} />}
          {activeTab === 'whitelist' && <WhitelistTab />}
          {activeTab === 'audit' && <AuditLogTab />}
          {activeTab === 'appeals' && <AppealsTab />}
          {activeTab === 'support' && <SupportTicketsTab onToast={addToast} />}
          {activeTab === 'moderation' && <ModerationTab onToast={addToast} />}
          {activeTab === 'firewall' && <FirewallTab onToast={addToast} />}
          {activeTab === 'monetization' && <MonetizationTab />}
          {activeTab === 'promotions' && <PromotionsTab onToast={addToast} />}
          {activeTab === 'verification' && (
            <UserVerificationTab onToast={addToast} />
          )}
          {activeTab === 'experiments' && <ExperimentsTab />}
          {activeTab === 'newsletter' && <NewsletterTab onToast={addToast} />}
          {activeTab === 'system-health' && <SystemHealthTab />}
          {activeTab === 'trust' && <TrustTab />}
        </motion.div>
      </AnimatePresence>
    </AdminShell>
  );
}
