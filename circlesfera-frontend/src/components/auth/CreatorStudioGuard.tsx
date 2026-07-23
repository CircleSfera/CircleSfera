import { type ReactNode, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { logger } from '../../utils/logger';

interface CreatorStudioGuardProps {
  children: ReactNode;
}

/**
 * Guard for Creator Studio routes.
 * Requires authentication and accountType CREATOR or BUSINESS
 * (same filter as the main Sidebar link).
 */
export default function CreatorStudioGuard({
  children,
}: CreatorStudioGuardProps) {
  const { isAuthenticated, profile } = useAuthStore();
  const location = useLocation();

  // Match Sidebar filter: profile.accountType (fallback user.accountType)
  const accountType =
    profile?.accountType || profile?.user?.accountType || 'PERSONAL';
  const isCreatorStudio =
    accountType === 'CREATOR' || accountType === 'BUSINESS';

  useEffect(() => {
    if (isAuthenticated && !isCreatorStudio) {
      logger.warn(
        `Creator Studio: user (${profile?.username}) with accountType=${accountType} tried to access ${location.pathname}`,
      );
      toast.error('Creator Studio is available for creator accounts.');
    }
  }, [isAuthenticated, isCreatorStudio, profile, accountType, location]);

  if (!isAuthenticated) {
    return <Navigate to="/accounts/login" state={{ from: location }} replace />;
  }

  if (!isCreatorStudio) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
