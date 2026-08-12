import { type ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { logger } from '../../utils/logger';

interface AdminGuardProps {
  children: ReactNode;
}

/**
 * Guard component for Admin routes.
 *
 * Checks if the user is authenticated AND has the 'ADMIN' role.
 * If not, redirects to the home page.
 */
export default function AdminGuard({ children }: AdminGuardProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const profile = useAuthStore((state) => state.profile);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const userRole = profile?.user?.role;
  const isStaff = userRole === 'ADMIN' || userRole === 'MODERATOR';

  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated && !isStaff) {
      logger.warn(
        `Security Alert: Non-staff user (${profile?.username}) tried to access ${location.pathname}`,
      );
    }
  }, [isAuthenticated, isStaff, profile, location]);

  if (!isSessionChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/accounts/login" state={{ from: location }} replace />;
  }

  if (!isStaff) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
