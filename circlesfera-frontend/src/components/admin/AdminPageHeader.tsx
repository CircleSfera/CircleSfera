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
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between shrink-0',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs sm:text-sm text-gray-400 mt-1 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-col xs:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
