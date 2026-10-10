import React, { forwardRef, useId } from 'react';

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
  /** Denser track + typography for composer / settings lists. */
  compact?: boolean;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  (
    {
      className = '',
      label,
      description,
      checked,
      onChange,
      disabled,
      id,
      compact = false,
      ...props
    },
    ref,
  ) => {
    // The visible label and description name and describe the control for
    // assistive technology, unless the caller names it itself.
    const baseId = useId();
    const labelId = label ? `${baseId}-label` : undefined;
    const descriptionId = description ? `${baseId}-description` : undefined;
    const named = props['aria-label'] || props['aria-labelledby'];

    return (
      <div
        className={`flex items-center justify-between ${compact ? 'gap-3' : 'gap-4'} ${className}`}
      >
        {(label || description) && (
          <div className={`flex flex-col min-w-0 ${compact ? 'gap-0.5' : ''}`}>
            {label && (
              <span
                id={labelId}
                className={`font-medium text-white ${compact ? 'text-[13px] leading-snug' : 'text-sm'}`}
              >
                {label}
              </span>
            )}
            {description && (
              <span
                id={descriptionId}
                className={`text-white/45 ${compact ? 'text-[11px] leading-snug' : 'text-xs text-gray-300'}`}
              >
                {description}
              </span>
            )}
          </div>
        )}
        <label
          className={`relative inline-flex min-h-11 min-w-11 items-center justify-end cursor-pointer shrink-0 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            type="checkbox"
            className="sr-only peer"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            ref={ref}
            id={id}
            aria-labelledby={named ? undefined : labelId}
            aria-describedby={descriptionId}
            {...props}
          />
          <div
            className={`${
              compact
                ? 'w-9 h-5 after:top-[2px] after:left-[2px] after:h-4 after:w-4'
                : 'w-11 h-6 after:top-0.5 after:left-0.5 after:h-5 after:w-5'
            } bg-white/10 backdrop-blur-md peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:bg-white after:border-gray-300 after:border after:rounded-full after:transition-all peer-checked:bg-linear-to-r peer-checked:from-brand-primary peer-checked:to-brand-primary/80 border border-white/10 shadow-inner`}
          />
        </label>
      </div>
    );
  },
);

Switch.displayName = 'Switch';
