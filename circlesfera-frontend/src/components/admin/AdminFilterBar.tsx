import { clsx } from 'clsx';

interface AdminFilterBarProps {
  children: React.ReactNode;
  className?: string;
}

// Sticky filter / search row under the admin header.
// Layout: column → row from sm. Dense padding (ops density). From sm every
// control in the bar is one height, 36 px, set once in index.css.
export function AdminFilterBar({ children, className }: AdminFilterBarProps) {
  return (
    <div
      className={clsx(
        'admin-filter-bar flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 shrink-0',
        'glass-panel rounded-lg p-1.5',
        className,
      )}
    >
      {children}
    </div>
  );
}
