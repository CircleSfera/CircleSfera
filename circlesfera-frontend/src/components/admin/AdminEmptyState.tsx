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

/**
 * Flat empty state — no nested glass card (parent panes are already glass).
 * Supports left-aligned hint via className (e.g. split empty detail).
 */
export function AdminEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact = false,
}: AdminEmptyStateProps) {
  const isStart =
    typeof className === 'string' &&
    (className.includes('items-start') || className.includes('text-left'));

  return (
    <div
      className={clsx(
        'flex flex-col mx-auto max-w-xs w-full',
        isStart
          ? 'items-start text-left'
          : 'items-center justify-center text-center',
        compact ? 'py-4 px-2 gap-1.5' : 'py-6 px-3 gap-2',
        className,
      )}
    >
      <div
        className={clsx(
          'rounded-lg flex items-center justify-center text-brand-primary/70 border border-brand-primary/15 bg-brand-primary/8',
          compact ? 'w-8 h-8' : 'w-10 h-10',
        )}
      >
        <Icon size={compact ? 14 : 18} />
      </div>
      <p className="text-xs font-semibold text-white/70">{title}</p>
      {description && (
        <p className="text-[11px] text-white/40 max-w-xs leading-snug">
          {description}
        </p>
      )}
      {action && <div className="mt-1 w-full sm:w-auto">{action}</div>}
    </div>
  );
}
