import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { GlobalKeyboardShortcuts } from '../components/common/GlobalKeyboardShortcuts';
import { OfflineIndicator } from '../components/common/OfflineIndicator';
import BottomNav from '../components/navigation/BottomNav';
import Sidebar from '../components/navigation/Sidebar';
import TopNav from '../components/navigation/TopNav';

import StoryViewer from '../components/StoryViewer';

import { useAuthStore } from '../stores/authStore';
import { useNotificationsStore } from '../stores/notificationsStore';
import { useSocketStore } from '../stores/socketStore';
import { useStoryStore } from '../stores/storyStore';

export default function LayoutWrapper({
  children,
  showNavigation = true,
}: {
  children: React.ReactNode;
  showNavigation?: boolean;
}) {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { connect, disconnect } = useSocketStore();
  const hideNavRoutes = [
    '/accounts/login',
    '/accounts/emailsignup',
    '/onboarding',
  ];

  const isAdminRoute = location.pathname.startsWith('/admin');
  const isCreatorRoute = location.pathname.startsWith('/creator');
  const isFramesRoute = location.pathname.startsWith('/frames');
  const isEditsRoute = location.pathname.startsWith('/edits');

  // Only show nav if authenticated AND not in hidden routes AND not in admin/creator
  const shouldShowNav =
    showNavigation &&
    isAuthenticated &&
    !hideNavRoutes.includes(location.pathname) &&
    !isAdminRoute &&
    !isCreatorRoute;

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isAuthenticated, connect, disconnect]);

  // Accessibility: Announce new notifications to screen readers
  const liveNotifications = useNotificationsStore(
    (state) => state.liveNotifications,
  );
  const latestNotification = liveNotifications[0];

  const { isOpen, stories, initialIndex, closeStories } = useStoryStore();

  return (
    <div
      className={`relative text-white selection:bg-purple-500/30 ${isFramesRoute ? 'h-dvh overflow-hidden' : 'min-h-screen overflow-x-hidden'}`}
    >
      {/* Skip to Content Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:px-6 focus:py-3 focus:bg-primary focus:text-white focus:rounded-xl focus:shadow-2xl focus:outline-none transition-all"
      >
        Skip to content
      </a>
      <OfflineIndicator />
      <GlobalKeyboardShortcuts />

      {/* ARIA Live Region for Real-time Announcements */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {latestNotification &&
          `New notification: ${latestNotification.content || 'You have a new update'}`}
      </div>

      {/* ─── Global Brand Gradient Background (Refined & Balanced) ─── */}
      <div className="fixed inset-0 z-[-1] overflow-hidden bg-[#08060f] pointer-events-none">
        {/* Calibrated multi-stop brand gradient (eliminates muddy mid-tones while preserving brand colors) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(circle at 12% 12%, rgba(255, 87, 87, 0.10) 0%, transparent 50%),
              radial-gradient(circle at 88% 88%, rgba(140, 82, 255, 0.16) 0%, transparent 55%),
              linear-gradient(135deg, rgba(255, 87, 87, 0.06) 0%, rgba(140, 82, 255, 0.12) 100%)
            `,
          }}
        />

        {/* Anti-banding micro texture (toned down from 0.14 to 0.04 to prevent static grain) */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            backgroundSize: '128px 128px',
          }}
        />

        {/* Ultra-soft vignette for central content focus */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(5, 4, 10, 0.45) 100%)',
          }}
        />
      </div>

      {/* Navigation — Each handles its own visibility via media queries */}
      {shouldShowNav && (
        <>
          {!location.pathname.includes('/direct/inbox/t/') &&
            !isFramesRoute &&
            !isEditsRoute && <TopNav />}
          <Sidebar />
          <BottomNav />
        </>
      )}

      <main
        id="main-content"
        className={`flex-1 w-full transition-all duration-300 ${shouldShowNav ? 'md:pl-20 xl:pl-56' : ''}`}
      >
        {/* Top spacing for mobile to account for TopNav height */}
        {shouldShowNav &&
          !location.pathname.startsWith('/direct') &&
          !isFramesRoute &&
          !isEditsRoute && <div className="md:hidden h-16" />}

        <div
          className={`w-full ${location.pathname.startsWith('/direct') ? (location.pathname.includes('/t/') ? 'h-[calc(100dvh-80px)] md:h-screen' : 'h-[calc(100dvh-64px-80px)] md:h-screen') : isFramesRoute ? 'h-dvh md:h-screen' : isEditsRoute ? 'h-[calc(100dvh-64px)] md:h-screen' : `min-h-screen ${shouldShowNav ? 'pb-24 md:pb-8' : ''}`} overflow-hidden`}
        >
          <div
            className={
              shouldShowNav &&
              !location.pathname.startsWith('/direct') &&
              !location.pathname.startsWith('/admin') &&
              !isFramesRoute &&
              !isEditsRoute
                ? 'mx-auto max-w-5xl 2xl:max-w-7xl px-4'
                : `w-full h-full ${shouldShowNav && !isFramesRoute && !isEditsRoute ? 'md:pb-10' : ''}`
            }
          >
            {children}
          </div>
        </div>
      </main>

      {isOpen && stories.length > 0 && (
        <StoryViewer
          stories={stories}
          initialIndex={initialIndex}
          onClose={closeStories}
        />
      )}
    </div>
  );
}
