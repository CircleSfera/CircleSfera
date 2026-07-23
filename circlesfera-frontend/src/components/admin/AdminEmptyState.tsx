import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

interface AdminEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

/** Unified empty state for admin lists and detail panes. */
export function AdminEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact = false,
}: AdminEmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center border border-dashed border-white/10 rounded-2xl bg-black/20',
        compact ? 'py-10 px-4 gap-2' : 'py-16 px-6 gap-3',
        className,
      )}
    >
      <div
        className={clsx(
          'rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500',
          compact ? 'w-12 h-12' : 'w-14 h-14',
        )}
      >
        <Icon size={compact ? 22 : 28} />
      </div>
      <p className="text-sm font-semibold text-white">{title}</p>
      {description && (
        <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-2 w-full sm:w-auto">{action}</div>}
    </div>
  );
}
