import { clsx } from 'clsx';

interface AdminFilterBarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Filter / search row. Children should use full-width controls on mobile.
 * Layout: column → row from sm.
 */
export function AdminFilterBar({ children, className }: AdminFilterBarProps) {
  return (
    <div
      className={clsx(
        'flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 shrink-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
