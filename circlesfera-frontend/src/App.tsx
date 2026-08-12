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
import CookieConsent from './components/CookieConsent';
import CreatePostModal from './components/CreatePostModal';
import BrandAmbientBackground from './components/common/BrandAmbientBackground';
import ScrollToTop from './components/common/ScrollToTop';
import CreateBottomSheet from './components/modals/CreateBottomSheet';
import { GlobalCallContainer } from './components/navigation/GlobalCallContainer';
import { useGlobalSocket } from './hooks/useGlobalSocket';
import LayoutWrapper from './layouts/LayoutWrapper';
// Page routes
import CommunityGuidelines from './pages/CommunityGuidelines';
import Explore from './pages/Explore';
import ExploreLanding from './pages/ExploreLanding';
import ForgotPassword from './pages/ForgotPassword';
import HighlightViewerPage from './pages/HighlightViewerPage';
import Home from './pages/Home';
import LandingPage from './pages/LandingPage';
import LiveBroadcaster from './pages/Live/LiveBroadcaster';
import LiveViewer from './pages/Live/LiveViewer';
import Login from './pages/Login';
import Messages from './pages/Messages';
import Notifications from './pages/Notifications';
import PostDetail from './pages/PostDetail';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import Saved from './pages/Saved';
import { Support } from './pages/Support';
import TagFeed from './pages/TagFeed';
import TermsOfService from './pages/TermsOfService';
import VerifyEmail from './pages/VerifyEmail';
import { useAdminAuthStore } from './stores/adminAuthStore';
import { useAuthStore } from './stores/authStore';
import { useExperimentStore } from './stores/useExperimentStore';
import { adminPanelOrigin, isAdminPanelHost } from './utils/adminPanel';

const Admin = lazy(() => import('./pages/Admin'));
const AdminPanelLogin = lazy(() => import('./pages/AdminPanelLogin'));
const ChatWindow = lazy(() => import('./components/chat/ChatWindow'));
const Creator = lazy(() => import('./pages/Creator'));
const EditsStudio = lazy(() => import('./pages/EditsStudio'));
const Frames = lazy(() => import('./pages/Frames'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Pricing = lazy(() => import('./pages/payments/Pricing'));
const Profile = lazy(() => import('./pages/Profile'));
const SelectChat = lazy(() => import('./components/chat/SelectChat'));
const Settings = lazy(() => import('./pages/Settings'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
// Helper to redirect /profile to current user's profile

// Component to redirect /profile to current user's profile
function ProfileRedirect() {
  const profile = useAuthStore((state) => state.profile);

  if (!profile?.username) {
    return <Navigate to="/" replace />;
  }

  return <Navigate to={`/${profile.username}`} replace />;
}

// Helper to redirect /profile/:username to /:username
function RedirectToProfile() {
  const { username } = useParams<{ username: string }>();
  return <Navigate to={`/${username}`} replace />;
}

/** Keep Stripe return query params when bouncing /creator → /creator/overview. */
function CreatorRootRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={`/creator/overview${location.search}${location.hash}`}
      replace
    />
  );
}

/** Apex /admin → Admin Panel host (root tabs: /trust, not /admin/trust). */
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

/** Bookmarks: admin host /admin/:tab → /:tab */
function LegacyAdminHostRedirect() {
  const { tab } = useParams<{ tab?: string }>();
  return <Navigate to={`/${tab || 'trust'}`} replace />;
}

/** Index `/` → permission-aware home (Trust when allowed). */
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
  const adminPanel = isAdminPanelHost();

  useGlobalSocket();

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

  if (adminPanel) {
    return <AdminPanelApp />;
  }

  // Hold route rendering until we know whether a persisted "logged in" state
  // is still valid, to avoid a flash of protected/guest content followed by
  // an immediate redirect.
  if (isAuthenticated && !isSessionChecked) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <LayoutWrapper>
      <ScrollToTop />
      <GlobalCallContainer />
      <CookieConsent />

      <CreateBottomSheet />
      <Suspense
        fallback={
          <div className="h-screen w-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <Routes>
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
            path="/accounts/emailsignup"
            element={
              <GuestGuard>
                <Register />
              </GuestGuard>
            }
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
                <CreatePostModal />
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

          {/* Tags */}
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

          {/* Settings */}
          <Route
            path="/accounts/edit"
            element={
              <AuthGuard>
                <Settings />
              </AuthGuard>
            }
          />
          {/* Keep old route for compatibility */}
          <Route
            path="/settings"
            element={<Navigate to="/accounts/edit" replace />}
          />

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

          {/* Notifications / Activity */}
          <Route
            path="/activity"
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
        </Routes>
      </Suspense>
    </LayoutWrapper>
  );
}

export default App;
