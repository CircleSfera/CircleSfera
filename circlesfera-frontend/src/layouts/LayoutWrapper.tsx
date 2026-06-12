import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
    '/admin',
    '/creator',
  ];

  // Only show nav if authenticated AND not in hidden routes
  // This ensures Landing Page (at '/') doesn't show nav when not logged in
  const shouldShowNav =
    showNavigation &&
    isAuthenticated &&
    !hideNavRoutes.includes(location.pathname);

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
    <div className="relative min-h-screen text-white overflow-x-hidden selection:bg-purple-500/30">
      {/* Skip to Content Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:px-6 focus:py-3 focus:bg-primary focus:text-white focus:rounded-xl focus:shadow-2xl focus:outline-none transition-all"
      >
        Skip to content
      </a>

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
      {/* Animated Mesh Gradient Background - Only for authenticated pages */}
      {shouldShowNav && (
        <div className="fixed inset-0 z-[-1]">
          <div className="absolute inset-0 bg-black" />
          <motion.div
            animate={{
              opacity: [0.4, 0.6, 0.4],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 10,
              repeat: Number.POSITIVE_INFINITY,
              repeatType: 'reverse',
            }}
            className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-brand-primary/30 rounded-full blur-[120px]"
          />
          <motion.div
            animate={{
              opacity: [0.3, 0.5, 0.3],
              x: [0, 50, 0],
            }}
            transition={{
              duration: 15,
              repeat: Number.POSITIVE_INFINITY,
              repeatType: 'reverse',
            }}
            className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-brand-secondary/20 rounded-full blur-[100px]"
          />

          {/* Noise overlay for texture */}
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            }}
          />
        </div>
      )}

      {/* Navigation - Each handles its own visibility via media queries */}
      {shouldShowNav && (
        <>
          {!location.pathname.includes('/direct/inbox/t/') && <TopNav />}
          <Sidebar />
          <BottomNav />
        </>
      )}

      {/* Main Content Area */}
      <main
        id="main-content"
        className={`flex-1 w-full transition-all duration-300 ${shouldShowNav ? 'md:pl-20 xl:pl-64' : ''}`}
      >
        {/* Top spacing for mobile to account for TopNav height */}
        {shouldShowNav && !location.pathname.startsWith('/direct') && (
          <div className="md:hidden h-16" />
        )}

        <div
          className={`w-full ${location.pathname.startsWith('/direct') ? (location.pathname.includes('/t/') ? 'h-[calc(100dvh-80px)] md:h-screen' : 'h-[calc(100dvh-64px-80px)] md:h-screen') : `min-h-screen ${shouldShowNav ? 'pb-24 md:pb-8' : ''}`} overflow-hidden`}
        >
          <div
            className={
              shouldShowNav && !location.pathname.startsWith('/direct')
                ? 'mx-auto max-w-5xl px-4'
                : `w-full h-full ${shouldShowNav ? 'md:pb-10' : ''}`
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
