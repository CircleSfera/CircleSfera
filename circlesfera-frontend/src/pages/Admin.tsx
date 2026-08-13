import { useCallback } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
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
  PayoutsTab,
  PostsTab,
  PromotionsTab,
  ReportsTab,
  RolesTab,
  SettingsTab,
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
import {
  ADMIN_TAB_PERMISSIONS,
  adminTabPath,
  getAdminHomeTab,
  isAdminTab,
} from '../components/admin/adminNav';
import { adminToast } from '../components/admin/adminToast';
import { useAdminAuthStore } from '../stores/adminAuthStore';

export default function Admin() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const hasPermission = useAdminAuthStore((s) => s.hasPermission);
  const homeTab = getAdminHomeTab(hasPermission);
  const isInvalidTab = !!tab && !isAdminTab(tab);
  const activeTab: AdminTab = isAdminTab(tab) ? tab : homeTab;
  const canOpenActiveTab = hasPermission(ADMIN_TAB_PERMISSIONS[activeTab]);

  const handleTabChange = useCallback(
    (newTab: AdminTab) => {
      navigate(adminTabPath(newTab));
    },
    [navigate],
  );

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    adminToast(message, type);
  }, []);

  if (isInvalidTab || (isAdminTab(tab) && !canOpenActiveTab)) {
    return <Navigate to={adminTabPath(homeTab)} replace />;
  }

  return (
    <AdminShell activeTab={activeTab} onTabChange={handleTabChange}>
      <div className="min-h-0">
        {activeTab === 'analytics' && <StatsTab />}
        {activeTab === 'reports' && <ReportsTab onToast={addToast} />}
        {activeTab === 'users' && <UsersTab onToast={addToast} />}
        {activeTab === 'roles' && <RolesTab onToast={addToast} />}
        {activeTab === 'posts' && <PostsTab onToast={addToast} />}
        {activeTab === 'comments' && <CommentsTab onToast={addToast} />}
        {activeTab === 'hashtags' && <HashtagsTab />}
        {activeTab === 'stories' && <StoriesTab onToast={addToast} />}
        {activeTab === 'live' && <LiveStreamsTab />}
        {activeTab === 'audio' && <AudioTab onToast={addToast} />}
        {activeTab === 'whitelist' && <WhitelistTab />}
        {activeTab === 'audit' && <AuditLogTab />}
        {activeTab === 'appeals' && <AppealsTab />}
        {activeTab === 'support' && <SupportTicketsTab onToast={addToast} />}
        {activeTab === 'moderation' && <ModerationTab onToast={addToast} />}
        {activeTab === 'firewall' && <FirewallTab onToast={addToast} />}
        {activeTab === 'monetization' && <MonetizationTab />}
        {activeTab === 'payouts' && <PayoutsTab />}
        {activeTab === 'promotions' && <PromotionsTab onToast={addToast} />}
        {activeTab === 'verification' && (
          <UserVerificationTab onToast={addToast} />
        )}
        {activeTab === 'experiments' && <ExperimentsTab />}
        {activeTab === 'newsletter' && <NewsletterTab onToast={addToast} />}
        {activeTab === 'system-health' && <SystemHealthTab />}
        {activeTab === 'settings' && <SettingsTab onToast={addToast} />}
        {activeTab === 'trust' && <TrustTab />}
      </div>
    </AdminShell>
  );
}
