import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import EmailVerificationBanner from '../components/auth/EmailVerificationBanner';
import BrandAmbientBackground from '../components/common/BrandAmbientBackground';
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
    '/accounts/signup',
    '/accounts/emailsignup',
    '/onboarding',
  ];

  const isAdminRoute = location.pathname.startsWith('/admin');
  const isFramesRoute = location.pathname.startsWith('/frames');
  const isEditsRoute = location.pathname.startsWith('/edits');
  const isCreateRoute = location.pathname.startsWith('/create');
  /** /edits and /create hide TopNav on mobile; /frames keeps chrome like the rest of the app. */
  const hideTopNavRoute = isEditsRoute || isCreateRoute;
  const isImmersiveRoute = isFramesRoute || isEditsRoute || isCreateRoute;

  const marketingRoutes = [
    '/features',
    '/principles',
    '/faq',
    '/terms',
    '/privacy',
    '/support',
    '/pricing',
    '/explore',
    '/guidelines',
  ];
  const isMarketingRoute = marketingRoutes.some(
    (r) => location.pathname === r || location.pathname.startsWith(`${r}/`),
  );

  // Admin is a separate product shell. Creator Studio sits in the app chrome
  // like Settings: global Sidebar + section rail.
  // /create is immersive: no TopNav/BottomNav on mobile (Sidebar stays on md+).
  // /frames keeps TopNav + BottomNav on mobile with a rounded player card.
  const shouldShowNav =
    showNavigation &&
    isAuthenticated &&
    !hideNavRoutes.includes(location.pathname) &&
    !isAdminRoute;

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

  // /edits is full-screen CapCut-like (no Sidebar). /create keeps Sidebar on md+.
  const isEditorRoute = isEditsRoute || isCreateRoute;
  const showAppSidebar = shouldShowNav && !isEditsRoute;
  const mainHasSidebarPad = showAppSidebar;

  // Immersive routes scroll inside their own container; lock document scroll.
  useLayoutEffect(() => {
    const shouldLockScroll = isFramesRoute || isEditorRoute;

    if (!shouldLockScroll) {
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    return () => {
      html.style.removeProperty('overflow');
      body.style.removeProperty('overflow');
      body.style.removeProperty('overscroll-behavior');
    };
  }, [isFramesRoute, isEditorRoute]);

  return (
    <div
      className={`relative text-white selection:bg-purple-500/30 ${
        isFramesRoute || isEditorRoute
          ? 'h-dvh overflow-hidden flex flex-col'
          : 'min-h-dvh flex flex-col overflow-x-hidden'
      }`}
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
      <BrandAmbientBackground />

      {shouldShowNav &&
        !location.pathname.includes('/direct/inbox/t/') &&
        !hideTopNavRoute && <TopNav />}

      {shouldShowNav && <EmailVerificationBanner immersive={hideTopNavRoute} />}

      {/* Navigation — Each handles its own visibility via media queries */}
      {shouldShowNav && (
        <>
          {showAppSidebar && <Sidebar />}
          {!isEditorRoute && <BottomNav />}
        </>
      )}

      <main
        id="main-content"
        className={`flex-1 min-h-0 w-full flex flex-col ${
          mainHasSidebarPad
            ? /* Sidebar: 68px collapsed (md), 260px expanded (xl) */
              'md:pl-17 xl:pl-65'
            : ''
        } ${
          shouldShowNav &&
          (isFramesRoute || location.pathname.startsWith('/direct'))
            ? 'max-md:pb-[calc(var(--nav-bottom-height)+env(safe-area-inset-bottom,0px))]'
            : ''
        }`}
      >
        {/* Top spacing for mobile to account for TopNav height (52px + safe area) */}
        {shouldShowNav &&
          !location.pathname.includes('/direct/inbox/t/') &&
          !hideTopNavRoute && (
            <div
              className="md:hidden shrink-0"
              style={{
                height:
                  'calc(var(--nav-top-height) + env(safe-area-inset-top, 0px))',
              }}
            />
          )}

        <div
          className={`w-full flex flex-col flex-1 min-h-0 ${
            location.pathname.startsWith('/direct')
              ? 'h-full min-h-0'
              : isFramesRoute || isEditorRoute
                ? 'h-full min-h-0'
                : `min-h-0 flex-1 ${isMarketingRoute ? '' : 'md:pb-8'}`
          } overflow-x-hidden`}
          style={
            shouldShowNav &&
            !isImmersiveRoute &&
            !isMarketingRoute &&
            !location.pathname.startsWith('/direct')
              ? {
                  paddingBottom:
                    'calc(var(--nav-bottom-height) + env(safe-area-inset-bottom, 0px))',
                }
              : undefined
          }
        >
          <div
            className={
              shouldShowNav &&
              !location.pathname.startsWith('/direct') &&
              !location.pathname.startsWith('/admin') &&
              !isImmersiveRoute &&
              !isMarketingRoute
                ? 'mx-auto max-w-5xl 2xl:max-w-7xl px-4 md:px-5 lg:px-6 w-full flex-1 flex flex-col'
                : `w-full h-full min-h-0 flex-1 flex flex-col ${
                    location.pathname.startsWith('/direct')
                      ? 'md:items-center md:justify-center'
                      : ''
                  } ${shouldShowNav && !isImmersiveRoute && !isMarketingRoute ? 'md:pb-10' : ''}`
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
