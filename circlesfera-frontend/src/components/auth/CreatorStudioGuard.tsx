import { type ReactNode, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { logger } from '../../utils/logger';

interface CreatorStudioGuardProps {
  children: ReactNode;
}

// Guard for Creator Studio routes.
// Requires authentication and accountType CREATOR or BUSINESS
// (same filter as the main Sidebar link).
export default function CreatorStudioGuard({
  children,
}: CreatorStudioGuardProps) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const profile = useAuthStore((state) => state.profile);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const location = useLocation();

  // Match Sidebar filter: profile.accountType (fallback user.accountType)
  const accountType = profile?.accountType || 'PERSONAL';
  const isCreatorStudio =
    accountType === 'CREATOR' || accountType === 'BUSINESS';

  useEffect(() => {
    if (isAuthenticated && !isCreatorStudio) {
      logger.warn(
        `Creator Studio: user (${profile?.username}) with accountType=${accountType} tried to access ${location.pathname}`,
      );
      toast.error(t('creator.guard.creators_only'));
    }
  }, [isAuthenticated, isCreatorStudio, profile, accountType, location, t]);

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

  if (!isCreatorStudio) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
