import { type ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { logger } from '../../utils/logger';

interface AdminGuardProps {
  children: ReactNode;
}

/**
 * UX guard for Admin Panel routes.
 * Security is enforced by AdminJwtAuthGuard on the API.
 */
export default function AdminGuard({ children }: AdminGuardProps) {
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated);
  const isSessionChecked = useAdminAuthStore((s) => s.isSessionChecked);
  const checkSession = useAdminAuthStore((s) => s.checkSession);
  const admin = useAdminAuthStore((s) => s.admin);
  const location = useLocation();

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (isSessionChecked && !isAuthenticated) {
      logger.warn(
        `Admin Panel: unauthenticated access attempt at ${location.pathname}`,
      );
    }
  }, [isSessionChecked, isAuthenticated, location.pathname]);

  if (!isSessionChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !admin) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
