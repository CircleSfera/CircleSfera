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
 * Admin empty state — thin domain wrapper over the shared EmptyState visual language.
 * Keeps Lucide icons + ReactNode actions required by admin tables; density matches
 * consumer EmptyState (Wave 1 state kit).
 */
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
        'flex flex-col items-center justify-center text-center mx-auto max-w-sm rounded-2xl border border-white/10 bg-surface-elevated/60',
        compact ? 'py-8 px-4 gap-2' : 'py-10 px-6 gap-3',
        className,
      )}
    >
      <div
        className={clsx(
          'rounded-2xl flex items-center justify-center text-brand-primary/80 border border-brand-primary/20',
          compact ? 'w-12 h-12' : 'w-14 h-14',
        )}
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--brand-primary-rgb), 0.18) 0%, rgba(82, 113, 255, 0.12) 100%)',
          boxShadow: '0 4px 20px rgba(var(--brand-primary-rgb), 0.12)',
        }}
      >
        <Icon size={compact ? 22 : 28} />
      </div>
      <p className="text-sm font-semibold text-white">{title}</p>
      {description && (
        <p className="text-xs text-white/50 max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-2 w-full sm:w-auto">{action}</div>}
    </div>
  );
}
