import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AdminGuard from '../../components/auth/AdminGuard';
import BrandAmbientBackground from '../../components/common/BrandAmbientBackground';
import BackofficeHome from './BackofficeHome';

const AdminPanelLogin = lazy(() => import('../AdminPanelLogin'));

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
                <BackofficeHome />
              </AdminGuard>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
