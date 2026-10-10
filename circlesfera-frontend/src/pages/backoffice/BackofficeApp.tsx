import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  adminTabPath,
  canOpenSite,
  getAdminHomeTab,
} from '../../components/admin/adminNav';
import AdminGuard from '../../components/auth/AdminGuard';
import BrandAmbientBackground from '../../components/common/BrandAmbientBackground';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import BackofficeHome from './BackofficeHome';

const Admin = lazy(() => import('../Admin'));
const AdminPanelLogin = lazy(() => import('../AdminPanelLogin'));

// The first section the operator can open; the home, which says what the site
// is for, when they can open none.
function BackofficeIndex() {
  const hasPermission = useAdminAuthStore((state) => state.hasPermission);
  if (!canOpenSite(hasPermission, 'backoffice')) return <BackofficeHome />;
  return (
    <Navigate
      to={adminTabPath(getAdminHomeTab(hasPermission, 'backoffice'))}
      replace
    />
  );
}

/**
 * The Backoffice: the staff site that runs the business, served on its own
 * host. It is opened with the staff session, signed in on this host; the
 * API checks that session and each permission on every request.
 */
export default function BackofficeApp() {
  return (
    <div className="relative min-h-dvh text-white selection:bg-brand-primary/30 overflow-x-hidden">
      <BrandAmbientBackground />
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
                <BackofficeIndex />
              </AdminGuard>
            }
          />
          <Route
            path="/:tab"
            element={
              <AdminGuard>
                <Admin />
              </AdminGuard>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
