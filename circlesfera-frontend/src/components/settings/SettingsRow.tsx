import type { ReactNode } from 'react';

interface SettingsRowProps {
  label: string;
  description?: string;
  control?: ReactNode;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  href?: string;
  as?: 'div' | 'button';
}

/**
 * Dense settings row: label (+ optional description) left, control right.
 * Minimum touch target 44px.
 */
export default function SettingsRow({
  label,
  description,
  control,
  children,
  className = '',
  onClick,
  as = 'div',
}: SettingsRowProps) {
  const content = (
    <>
      <div className="flex-1 min-w-0 pr-3">
        <p className="text-sm font-medium text-white">{label}</p>
        {description ? (
          <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
            {description}
          </p>
        ) : null}
        {children}
      </div>
      {control ? (
        <div className="shrink-0 flex items-center">{control}</div>
      ) : null}
    </>
  );

  const baseClass = `flex items-center gap-3 px-4 py-3 min-h-11 w-full text-left ${className}`;

  if (as === 'button' || onClick) {
    return (
      <button type="button" onClick={onClick} className={baseClass}>
        {content}
      </button>
    );
  }

  return <div className={baseClass}>{content}</div>;
}
