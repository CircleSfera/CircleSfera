import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppLockScreen } from '../components/auth/AppLockScreen';
import CookieConsent from '../components/CookieConsent';
import ScrollToTop from '../components/common/ScrollToTop';
import CreateBottomSheet from '../components/modals/CreateBottomSheet';
import { GlobalCallContainer } from '../components/navigation/GlobalCallContainer';
import LayoutWrapper from './LayoutWrapper';

/** Stable outlet key for nested shells (chat threads, settings sections). */
function routeOutletKey(pathname: string): string {
  if (pathname.startsWith('/direct/inbox')) return '/direct/inbox';
  if (pathname.startsWith('/accounts')) return '/accounts';
  if (pathname.startsWith('/creator/')) return '/creator';
  return pathname;
}

export default function AppShell() {
  const location = useLocation();
  const outletKey = routeOutletKey(location.pathname);

  return (
    <LayoutWrapper>
      <ScrollToTop />
      <GlobalCallContainer />
      <CookieConsent />
      <AppLockScreen />
      <CreateBottomSheet />
      <Suspense
        key={`${location.key}:${outletKey}`}
        fallback={
          <div className="h-full min-h-[40vh] w-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </LayoutWrapper>
  );
}
