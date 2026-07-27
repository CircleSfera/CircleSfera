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
  const { isAuthenticated, profile } = useAuthStore();
  const location = useLocation();

  const userRole = profile?.user?.role;
  const isStaff = userRole === 'ADMIN' || userRole === 'MODERATOR';

  useEffect(() => {
    if (isAuthenticated && !isStaff) {
      logger.warn(
        `Security Alert: Non-staff user (${profile?.username}) tried to access ${location.pathname}`,
      );
    }
  }, [isAuthenticated, isStaff, profile, location]);

  if (!isAuthenticated) {
    return <Navigate to="/accounts/login" state={{ from: location }} replace />;
  }

  if (!isStaff) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
