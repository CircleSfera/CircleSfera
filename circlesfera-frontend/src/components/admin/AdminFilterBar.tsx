import { clsx } from 'clsx';

interface AdminFilterBarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Sticky filter / search row under the admin header.
 * Layout: column → row from sm.
 */
export function AdminFilterBar({ children, className }: AdminFilterBarProps) {
  return (
    <div
      className={clsx(
        'flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3 shrink-0 py-1 bg-transparent',
        className,
      )}
    >
      {children}
    </div>
  );
}
