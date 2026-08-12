import { clsx } from 'clsx';

interface AdminFilterBarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Sticky filter / search row under the admin header.
 * Layout: column → row from sm. Dense padding (ops density).
 */
export function AdminFilterBar({ children, className }: AdminFilterBarProps) {
  return (
    <div
      className={clsx(
        'flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 shrink-0',
        'glass-panel rounded-lg p-1.5 sm:p-2',
        className,
      )}
    >
      {children}
    </div>
  );
}
