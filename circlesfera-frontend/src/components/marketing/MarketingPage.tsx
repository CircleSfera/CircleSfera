import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { GuestAppChrome } from './GuestAppChrome';
import { GuestFooter } from './GuestFooter';

interface MarketingPageProps {
  children: ReactNode;
  className?: string;
  withNav?: boolean;
  withFooter?: boolean;
  navLinks?: boolean;
}

/**
 * Guest page shell — TopNav-parity chrome. Skips guest nav when authenticated.
 */
export function MarketingPage({
  children,
  className,
  withNav = true,
  withFooter = true,
  navLinks = true,
}: MarketingPageProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const showGuestNav = withNav && !isAuthenticated;

  return (
    <div
      className={clsx(
        'min-h-dvh w-full h-full flex-1 flex flex-col text-white font-sans selection:bg-brand-primary/30 relative overflow-x-hidden',
        className,
      )}
    >
      {showGuestNav && <GuestAppChrome showLinks={navLinks} />}
      <div
        className={clsx(
          'flex-1 flex flex-col w-full relative z-10',
          showGuestNav &&
            'pt-[calc(var(--nav-top-height,52px)+env(safe-area-inset-top,0px))]',
          isAuthenticated && withNav && 'pt-2 md:pt-4',
        )}
      >
        {children}
      </div>
      {withFooter && <GuestFooter />}
    </div>
  );
}
