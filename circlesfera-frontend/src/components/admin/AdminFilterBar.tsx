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
        'sticky top-[4.5rem] sm:top-[5.25rem] z-20 -mx-1 px-1 py-2',
        'bg-black/90 border-b border-white/5',
        'flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 shrink-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
