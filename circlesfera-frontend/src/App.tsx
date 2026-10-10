import { lazy, Suspense, useEffect } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { adminTabPath, getAdminHomeTab } from './components/admin/adminNav';
import AdminGuard from './components/auth/AdminGuard';
import AuthGuard from './components/auth/AuthGuard';
import CreatorStudioGuard from './components/auth/CreatorStudioGuard';
import GuestGuard from './components/auth/GuestGuard';
import BrandAmbientBackground from './components/common/BrandAmbientBackground';
import ScrollToTop from './components/common/ScrollToTop';
import { useAccountLocaleSync } from './hooks/useAccountLocaleSync';
import { useNativeApp } from './hooks/useNativeApp';
import { usePushNotifications } from './hooks/usePushNotifications';
import AppShell from './layouts/AppShell';
// Page routes
import ExploreLanding from './pages/ExploreLanding';
import FeatureDetailPage, {
  ExploreFeatureRedirect,
} from './pages/FeatureDetailPage';
import Home from './pages/Home';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import { Support } from './pages/Support';
import { SupportRequest } from './pages/SupportRequest';
import { useAdminAuthStore } from './stores/adminAuthStore';
import { useAuthStore } from './stores/authStore';
import { useExperimentStore } from './stores/useExperimentStore';
import {
  adminPanelOrigin,
  isAdminPanelHost,
  isBackofficeHost,
} from './utils/adminPanel';

// Loaded on demand, so the first visit downloads only the entry pages.
const Admin = lazy(() => import('./pages/Admin'));
const AdminPanelLogin = lazy(() => import('./pages/AdminPanelLogin'));
const BackofficeApp = lazy(() => import('./pages/backoffice/BackofficeApp'));
const ChatWindow = lazy(() => import('./components/chat/ChatWindow'));
const CommunityGuidelines = lazy(() => import('./pages/CommunityGuidelines'));
const ContentComposerPage = lazy(
  () => import('./components/ContentComposerPage'),
);
const Creator = lazy(() => import('./pages/Creator'));
const EditsStudio = lazy(() => import('./pages/EditsStudio'));
const Explore = lazy(() => import('./pages/Explore'));
const ExploreMapPage = lazy(() => import('./pages/explore-map/ExploreMapPage'));
const HelpArticle = lazy(() => import('./pages/HelpArticle'));
const HelpCentre = lazy(() => import('./pages/HelpCentre'));
const FeaturesPage = lazy(() => import('./pages/FeaturesPage'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Frames = lazy(() => import('./pages/Frames'));
const HighlightViewerPage = lazy(() => import('./pages/HighlightViewerPage'));
const LiveBroadcaster = lazy(() => import('./pages/Live/LiveBroadcaster'));
const LiveViewer = lazy(() => import('./pages/Live/LiveViewer'));
const Messages = lazy(() => import('./pages/Messages'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const PostDetail = lazy(() => import('./pages/PostDetail'));
const Pricing = lazy(() => import('./pages/payments/Pricing'));
const PrinciplesPage = lazy(() => import('./pages/PrinciplesPage'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const Profile = lazy(() => import('./pages/Profile'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Saved = lazy(() => import('./pages/Saved'));
const SelectChat = lazy(() => import('./components/chat/SelectChat'));
const Settings = lazy(() => import('./pages/Settings'));
const TagFeed = lazy(() => import('./pages/TagFeed'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
// Helper to redirect /profile to current user's profile

// Component to redirect /profile to current user's profile
function ProfileRedirect() {
  const profile = useAuthStore((state) => state.profile);
  const location = useLocation();

  if (!profile?.username) {
    return <Navigate to="/" replace />;
  }

  return (
    <Navigate
      to={`/${profile.username}${location.search}${location.hash}`}
      replace
    />
  );
}

// Helper to redirect /profile/:username to /:username
function RedirectToProfile() {
  const { username } = useParams<{ username: string }>();
  return <Navigate to={`/${username}`} replace />;
}

// Keep Stripe return query params when bouncing /creator → /creator/overview.
function CreatorRootRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={`/creator/overview${location.search}${location.hash}`}
      replace
    />
  );
}

// Legacy register URL — canonical path is /accounts/signup.
function SignupLegacyRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={`/accounts/signup${location.search}${location.hash}`}
      replace
    />
  );
}

// Apex /admin → Admin Panel host (root tabs: /trust, not /admin/trust).
function AdminApexRedirect() {
  const { tab } = useParams<{ tab?: string }>();
  const target = `${adminPanelOrigin()}/${tab || 'trust'}`;
  useEffect(() => {
    window.location.replace(target);
  }, [target]);
  return (
    <div className="h-screen w-full flex items-center justify-center text-white/60 text-sm">
      Redirecting to Admin Panel…
    </div>
  );
}

// Bookmarks: admin host /admin/:tab → /:tab
function LegacyAdminHostRedirect() {
  const { tab } = useParams<{ tab?: string }>();
  return <Navigate to={`/${tab || 'trust'}`} replace />;
}

// Index `/` → permission-aware home (Trust when allowed).
function AdminHomeRedirect() {
  const hasPermission = useAdminAuthStore((s) => s.hasPermission);
  return <Navigate to={adminTabPath(getAdminHomeTab(hasPermission))} replace />;
}

function AdminPanelApp() {
  return (
    <div className="relative min-h-dvh text-white selection:bg-brand-primary/30 overflow-x-hidden">
      <BrandAmbientBackground />
      <ScrollToTop />
      <Suspense
        fallback={
          <div className="h-screen w-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <Routes>
          <Route path="/login" element={<AdminPanelLogin />} />
          <Route
            path="/"
            element={
              <AdminGuard>
                <AdminHomeRedirect />
              </AdminGuard>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminGuard>
                <AdminHomeRedirect />
              </AdminGuard>
            }
          />
          <Route path="/admin/:tab" element={<LegacyAdminHostRedirect />} />
          <Route
            path="/:tab"
            element={
              <AdminGuard>
                <Admin />
              </AdminGuard>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const checkSession = useAuthStore((state) => state.checkSession);
  const fetchFlags = useExperimentStore((state) => state.fetchFlags);
  const backoffice = isBackofficeHost();
  // Staff sites have their own session; the participant one is not checked.
  const adminPanel = backoffice || isAdminPanelHost();

  usePushNotifications();
  useNativeApp();
  useAccountLocaleSync();

  useEffect(() => {
    if (!adminPanel) {
      checkSession();
    }
  }, [checkSession, adminPanel]);

  useEffect(() => {
    if (!adminPanel && isAuthenticated !== undefined) {
      fetchFlags();
    }
  }, [fetchFlags, isAuthenticated, adminPanel]);

  if (backoffice) {
    return (
      <Suspense fallback={null}>
        <BackofficeApp />
      </Suspense>
    );
  }

  if (adminPanel) {
    return <AdminPanelApp />;
  }

  // Hold route rendering until we know whether a persisted "logged in" state
  // Is still valid, to avoid a flash of protected/guest content followed by
  // An immediate redirect.
  if (isAuthenticated && !isSessionChecked) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Auth routes */}
        <Route
          path="/accounts/login"
          element={
            <GuestGuard>
              <Login />
            </GuestGuard>
          }
        />
        <Route
          path="/accounts/signup"
          element={
            <GuestGuard>
              <Register />
            </GuestGuard>
          }
        />
        <Route
          path="/accounts/emailsignup"
          element={<SignupLegacyRedirect />}
        />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* ... (static redirects remain same) */}

        {/* Home feed or Landing Page based on auth */}
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <AuthGuard>
                <Home />
              </AuthGuard>
            ) : (
              <LandingPage />
            )
          }
        />

        {/* Onboarding Wizard */}
        <Route
          path="/onboarding"
          element={
            <AuthGuard>
              <Onboarding />
            </AuthGuard>
          }
        />

        {/* Explore */}
        <Route
          path="/explore"
          element={
            isAuthenticated ? (
              <AuthGuard>
                <Explore />
              </AuthGuard>
            ) : (
              <ExploreLanding />
            )
          }
        />

        {/* Create post - opens modal */}
        <Route
          path="/create"
          element={
            <AuthGuard>
              <ContentComposerPage />
            </AuthGuard>
          }
        />

        {/* Edits Studio */}
        <Route
          path="/edits"
          element={
            <AuthGuard>
              <EditsStudio />
            </AuthGuard>
          }
        />

        {/* Live Spaces */}
        <Route
          path="/live/broadcast"
          element={
            <AuthGuard>
              <LiveBroadcaster />
            </AuthGuard>
          }
        />
        <Route
          path="/live/:streamId"
          element={
            <AuthGuard>
              <LiveViewer />
            </AuthGuard>
          }
        />

        {/* Explore map — before /explore/:feature and tags sibling */}
        <Route
          path="/explore/map"
          element={
            <AuthGuard>
              <ExploreMapPage />
            </AuthGuard>
          }
        />

        {/* Tags — before /explore/:feature so "tags" is not treated as a feature slug */}
        <Route
          path="/explore/tags/:tag"
          element={
            <AuthGuard>
              <TagFeed />
            </AuthGuard>
          }
        />
        {/* Keep old route for compatibility */}
        <Route
          path="/tags/:tag"
          element={<Navigate to="/explore/tags/:tag" replace />}
        />

        {/* Legacy guest deep-dives → /features/:slug */}
        <Route path="/explore/:feature" element={<ExploreFeatureRedirect />} />

        {/* Post detail - /p/:id */}
        <Route
          path="/p/:id"
          element={
            <AuthGuard>
              <PostDetail />
            </AuthGuard>
          }
        />
        {/* Keep old route for compatibility */}
        <Route path="/post/:id" element={<Navigate to="/p/:id" replace />} />

        {/* Direct messages — Messages shell stays eager; chat panes are lazy */}
        <Route
          path="/direct/inbox"
          element={
            <AuthGuard>
              <Messages />
            </AuthGuard>
          }
        >
          <Route index element={<SelectChat />} />
          <Route path="t/:id" element={<ChatWindow />} />
        </Route>
        {/* Keep old routes for compatibility */}
        <Route
          path="/messages"
          element={<Navigate to="/direct/inbox" replace />}
        />
        <Route
          path="/messages/:id"
          element={<Navigate to="/direct/inbox/t/:id" replace />}
        />

        {/* Account hub — reserved auth paths declared above */}
        <Route
          path="/accounts"
          element={
            <AuthGuard>
              <Settings />
            </AuthGuard>
          }
        />
        <Route
          path="/accounts/:section"
          element={
            <AuthGuard>
              <Settings />
            </AuthGuard>
          }
        />
        <Route path="/settings" element={<Navigate to="/accounts" replace />} />

        {/* Pricing & Subscriptions - Public for Stripe Compliance */}
        <Route path="/pricing" element={<Pricing />} />

        {/* Profile redirect - redirects /profile to /:username */}
        <Route
          path="/profile"
          element={
            <AuthGuard>
              <ProfileRedirect />
            </AuthGuard>
          }
        />
        <Route
          path="/profile/:username"
          element={
            <AuthGuard>
              {/* Use a function component to access params and redirect dynamically */}
              <RedirectToProfile />
            </AuthGuard>
          }
        />

        {/* Admin Panel lives on admin.circlesfera.com — redirect apex /admin */}
        <Route path="/admin" element={<AdminApexRedirect />} />
        <Route path="/admin/:tab" element={<AdminApexRedirect />} />

        {/* Notifications */}
        <Route
          path="/notifications"
          element={
            <AuthGuard>
              <Notifications />
            </AuthGuard>
          }
        />

        {/* Frames (Reels) */}
        <Route
          path="/frames"
          element={
            <AuthGuard>
              <Frames />
            </AuthGuard>
          }
        />

        {/* Saved posts */}
        <Route
          path="/saved"
          element={
            <AuthGuard>
              <Saved />
            </AuthGuard>
          }
        />

        {/* Creator Studio — preserve query (e.g. Stripe return ?promotion=) */}
        <Route path="/creator" element={<CreatorRootRedirect />} />
        <Route
          path="/creator/:tab"
          element={
            <CreatorStudioGuard>
              <Creator />
            </CreatorStudioGuard>
          }
        />

        <Route
          path="/stories/highlights/:id"
          element={
            <AuthGuard>
              <HighlightViewerPage />
            </AuthGuard>
          }
        />

        {/* Static Pages — before /:username so they are not captured as usernames */}
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/guidelines" element={<CommunityGuidelines />} />
        <Route path="/support" element={<Support />} />
        <Route
          path="/support/requests/:id"
          element={
            <AuthGuard>
              <SupportRequest />
            </AuthGuard>
          }
        />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/features/:slug" element={<FeatureDetailPage />} />
        <Route path="/principles" element={<PrinciplesPage />} />
        <Route path="/help" element={<HelpCentre />} />
        <Route path="/help/:slug" element={<HelpArticle />} />
        {/* The questions that lived here are articles of the help centre */}
        <Route path="/faq" element={<Navigate to="/help" replace />} />

        {/* User profile (after static routes to avoid conflicts) */}
        <Route
          path="/:username"
          element={
            <AuthGuard>
              <Profile />
            </AuthGuard>
          }
        />

        {/* Catch-all 404 — must be last (after /:username) */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default App;
