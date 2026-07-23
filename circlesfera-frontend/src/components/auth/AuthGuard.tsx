import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isCheckingSession = useAuthStore((state) => state.isCheckingSession);
  const checkSession = useAuthStore((state) => state.checkSession);

  useEffect(() => {
    // Guards against a stale persisted `isAuthenticated: true` (e.g. the
    // session cookie expired while the app was closed). Idempotent: the
    // store dedupes concurrent/repeated calls once a check has run.
    checkSession();
  }, [checkSession]);

  // While we haven't confirmed a persisted session is still valid, avoid
  // flashing protected content that might get revoked a moment later.
  if (isAuthenticated && !isSessionChecked && isCheckingSession) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/accounts/login" replace />;
  }

  return <>{children}</>;
}
