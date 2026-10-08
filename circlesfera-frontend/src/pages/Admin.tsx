import { useCallback, useEffect } from 'react';
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  AppealsTab,
  AudioTab,
  AuditLogTab,
  CommentsTab,
  DisputesTab,
  ExperimentsTab,
  FirewallTab,
  HashtagsTab,
  LiveStreamsTab,
  ModerationTab,
  MonetizationTab,
  NewsletterTab,
  OverviewTab,
  PayoutsTab,
  PlansTab,
  PostsTab,
  PromotionsTab,
  ReportsTab,
  RolesTab,
  SettingsTab,
  SpamReviewTab,
  StatsTab,
  StoriesTab,
  SubscriptionsTab,
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
  adminTabPath,
  canOpenSite,
  canOpenTab,
  currentStaffSite,
  getAdminHomeTab,
  isAdminTab,
  staffTabHref,
  tabSite,
} from '../components/admin/adminNav';
import { adminToast } from '../components/admin/adminToast';
import { useAdminAuthStore } from '../stores/adminAuthStore';
import { backofficeOrigin } from '../utils/adminPanel';

// Leaves this staff site for the other one. A full page load: each site has
// its own session.
function OtherStaffSite({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function Admin() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const hasPermission = useAdminAuthStore((s) => s.hasPermission);
  const homeTab = getAdminHomeTab(hasPermission);
  const isInvalidTab = !!tab && !isAdminTab(tab);
  const activeTab: AdminTab = isAdminTab(tab) ? tab : homeTab;
  const canOpenActiveTab = canOpenTab(hasPermission, activeTab);

  const handleTabChange = useCallback(
    (newTab: AdminTab) => {
      navigate(adminTabPath(newTab));
    },
    [navigate],
  );

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    adminToast(message, type);
  }, []);

  // A section that lives in the other staff site is opened there. Links to
  // it from this site keep working: they land here and are sent on.
  if (isAdminTab(tab) && tabSite(tab) !== currentStaffSite()) {
    return <OtherStaffSite to={staffTabHref(tab, location.search)} />;
  }

  if (isInvalidTab || (isAdminTab(tab) && !canOpenActiveTab)) {
    // Nothing to open in this site: the home of the Backoffice says so; the
    // Admin Panel has no such page, so the operator is sent to the other
    // site when that is where their sections are.
    if (!canOpenSite(hasPermission, currentStaffSite())) {
      return currentStaffSite() === 'backoffice' ? (
        <Navigate to="/" replace />
      ) : canOpenSite(hasPermission, 'backoffice') ? (
        <OtherStaffSite to={backofficeOrigin()} />
      ) : (
        <Navigate to="/login" replace />
      );
    }
    return <Navigate to={adminTabPath(homeTab)} replace />;
  }

  return (
    <AdminShell activeTab={activeTab} onTabChange={handleTabChange}>
      <div className="min-h-0">
        {activeTab === 'overview' && <OverviewTab />}
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
        {activeTab === 'spam-review' && <SpamReviewTab />}
        {activeTab === 'support' && <SupportTicketsTab onToast={addToast} />}
        {activeTab === 'plans' && <PlansTab onToast={addToast} />}
        {activeTab === 'subscriptions' && <SubscriptionsTab />}
        {activeTab === 'disputes' && <DisputesTab />}
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
