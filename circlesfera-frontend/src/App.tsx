import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import AdminGuard from './components/auth/AdminGuard';
import AuthGuard from './components/auth/AuthGuard';
import GuestGuard from './components/auth/GuestGuard';
import CreatePostModal from './components/CreatePostModal';
import ChatWindow from './components/chat/ChatWindow';
import SelectChat from './components/chat/SelectChat';
import ScrollToTop from './components/common/ScrollToTop';
import CreateBottomSheet from './components/modals/CreateBottomSheet';
import { GlobalCallContainer } from './components/navigation/GlobalCallContainer';
import LayoutWrapper from './layouts/LayoutWrapper';

const Admin = lazy(() => import('./pages/Admin'));
const Creator = lazy(() => import('./pages/Creator'));

import CommunityGuidelines from './pages/CommunityGuidelines';
import Explore from './pages/Explore';
import ExploreLanding from './pages/ExploreLanding';
import ForgotPassword from './pages/ForgotPassword';
import Frames from './pages/Frames';
// Page routes
import HighlightViewerPage from './pages/HighlightViewerPage';
import Home from './pages/Home';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Messages from './pages/Messages';
import Notifications from './pages/Notifications';
import PostDetail from './pages/PostDetail';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Profile from './pages/Profile';

const Pricing = lazy(() => import('./pages/payments/Pricing'));

import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import Saved from './pages/Saved';

const Settings = lazy(() => import('./pages/Settings'));

import TagFeed from './pages/TagFeed';
import TermsOfService from './pages/TermsOfService';
import VerifyEmail from './pages/VerifyEmail';
import { useAuthStore } from './stores/authStore';

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

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <LayoutWrapper>
      <ScrollToTop />
      <GlobalCallContainer />
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

          {/* Direct messages */}
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

          <Route
            path="/admin"
            element={
              <AdminGuard>
                <Admin />
              </AdminGuard>
            }
          />

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

          {/* Creator Studio */}
          <Route
            path="/creator"
            element={
              <AuthGuard>
                <Creator />
              </AuthGuard>
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

          {/* User profile (MUST be last to avoid conflicts) */}
          <Route
            path="/:username"
            element={
              <AuthGuard>
                <Profile />
              </AuthGuard>
            }
          />

          {/* Static Pages */}
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/guidelines" element={<CommunityGuidelines />} />
        </Routes>
      </Suspense>
    </LayoutWrapper>
  );
}

export default App;
