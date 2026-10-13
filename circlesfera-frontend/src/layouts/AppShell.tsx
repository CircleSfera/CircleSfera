import { lazy, Suspense, useRef } from 'react';
import {
  NavigationType,
  Outlet,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { AppLockScreen } from '../components/auth/AppLockScreen';
import CookieConsent from '../components/CookieConsent';
import ScrollToTop from '../components/common/ScrollToTop';
import ErrorBoundary from '../components/ErrorBoundary';
import CreateBottomSheet from '../components/modals/CreateBottomSheet';
import { GlobalCallContainer } from '../components/navigation/GlobalCallContainer';
import { useUIStore } from '../stores/uiStore';
import LayoutWrapper from './LayoutWrapper';

const CreateHighlightModal = lazy(
  () => import('../components/modals/CreateHighlightModal'),
);

// Stable outlet key for nested shells (chat threads, settings sections)
function routeOutletKey(pathname: string): string {
  if (pathname.startsWith('/direct/inbox')) return '/direct/inbox';
  if (pathname.startsWith('/accounts')) return '/accounts';
  if (pathname.startsWith('/creator/')) return '/creator';
  return pathname;
}

// The key the screen is mounted under. Going to a screen mounts it anew. A
// screen that only rewrites its own address in place (the section of a
// Profile, a filter) is still the same screen: mounting it again would
// throw away what it shows and start it over, counters included.
function useScreenKey(): string {
  const location = useLocation();
  const navigationType = useNavigationType();
  const shown = useRef({ pathname: location.pathname, key: location.key });
  const sameScreen =
    navigationType === NavigationType.Replace &&
    shown.current.pathname === location.pathname;
  if (!sameScreen) {
    shown.current = { pathname: location.pathname, key: location.key };
  }
  return shown.current.key;
}

function GlobalCreateHighlightModal() {
  const isOpen = useUIStore((s) => s.isCreateHighlightOpen);
  const close = useUIStore((s) => s.closeCreateHighlight);
  return (
    <Suspense fallback={null}>
      <CreateHighlightModal isOpen={isOpen} onClose={close} />
    </Suspense>
  );
}

export default function AppShell() {
  const location = useLocation();
  const outletKey = routeOutletKey(location.pathname);
  const screenKey = useScreenKey();

  return (
    <LayoutWrapper>
      <ScrollToTop />
      <GlobalCallContainer />
      <CookieConsent />
      <AppLockScreen />
      <CreateBottomSheet />
      <GlobalCreateHighlightModal />
      {/* A screen that fails shows its error here, inside the layout: the
          navigation stays, and going to another screen clears it. */}
      <ErrorBoundary key={location.pathname} scope="page">
        <Suspense
          key={`${screenKey}:${outletKey}`}
          fallback={
            <div className="h-full min-h-[40vh] w-full flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </LayoutWrapper>
  );
}
