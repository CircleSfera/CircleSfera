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
import {
  getContentShell,
  hidesBottomNav,
  hidesTopNav,
  isEditsPath,
  isViewportLockedShell,
} from './contentShell';

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

  const shell = getContentShell(location.pathname);
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isFramesRoute = shell === 'vertical';
  const isEditsRoute = isEditsPath(location.pathname);
  const hideTopNavRoute = hidesTopNav(shell);
  const hideBottomNavRoute = hidesBottomNav(shell);
  const isViewportLocked = isViewportLockedShell(shell);
  // Create shell keeps Sidebar on md+; edits studio does not
  const isCreateComposer =
    shell === 'create' && location.pathname.startsWith('/create');

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

  const liveNotifications = useNotificationsStore(
    (state) => state.liveNotifications,
  );
  const latestNotification = liveNotifications[0];

  const { isOpen, stories, initialIndex, closeStories } = useStoryStore();

  const showAppSidebar = shouldShowNav && !isEditsRoute;
  const mainHasSidebarPad = showAppSidebar;

  useLayoutEffect(() => {
    if (!isViewportLocked) {
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
  }, [isViewportLocked]);

  return (
    <div
      className={`relative text-white selection:bg-purple-500/30 ${
        isViewportLocked
          ? 'h-dvh overflow-hidden flex flex-col'
          : 'min-h-dvh flex flex-col overflow-x-hidden'
      }`}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:px-6 focus:py-3 focus:bg-primary focus:text-white focus:rounded-xl focus:shadow-2xl focus:outline-none transition-all"
      >
        Skip to content
      </a>
      <OfflineIndicator />
      <GlobalKeyboardShortcuts />

      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {latestNotification &&
          `New notification: ${latestNotification.content || 'You have a new update'}`}
      </div>

      <BrandAmbientBackground />

      {shouldShowNav &&
        !location.pathname.includes('/direct/inbox/t/') &&
        !hideTopNavRoute && <TopNav />}

      {shouldShowNav && <EmailVerificationBanner immersive={hideTopNavRoute} />}

      {shouldShowNav && (
        <>
          {showAppSidebar && <Sidebar />}
          {!hideBottomNavRoute && <BottomNav />}
        </>
      )}

      <main
        id="main-content"
        className={`flex-1 min-h-0 w-full flex flex-col ${
          mainHasSidebarPad ? 'md:pl-17 xl:pl-65' : ''
        } ${
          shouldShowNav &&
          (isFramesRoute || location.pathname.startsWith('/direct'))
            ? 'max-md:pb-[calc(var(--nav-bottom-height)+env(safe-area-inset-bottom,0px))]'
            : ''
        }`}
        data-content-shell={shell}
        data-create-composer={isCreateComposer ? 'true' : undefined}
      >
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
              : isViewportLocked
                ? 'h-full min-h-0'
                : `min-h-0 flex-1 ${isMarketingRoute ? '' : 'md:pb-8'}`
          } overflow-x-hidden`}
          style={
            shouldShowNav &&
            !hideBottomNavRoute &&
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
              !isViewportLocked &&
              !isMarketingRoute
                ? 'mx-auto max-w-5xl 2xl:max-w-7xl px-4 md:px-5 lg:px-6 w-full flex-1 flex flex-col'
                : `w-full h-full min-h-0 flex-1 flex flex-col ${
                    location.pathname.startsWith('/direct')
                      ? 'md:items-center md:justify-center'
                      : ''
                  } ${shouldShowNav && !isViewportLocked && !isMarketingRoute ? 'md:pb-10' : ''}`
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
