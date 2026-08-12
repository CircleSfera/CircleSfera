import { clsx } from 'clsx';

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

/** Page title row: stacks on mobile, actions on the right from sm+. */
export function AdminPageHeader({
  title,
  subtitle,
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between shrink-0',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-white/45 mt-1 leading-snug line-clamp-2 sm:line-clamp-none">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
