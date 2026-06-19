import React, { forwardRef } from 'react';

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
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
      ...props
    },
    ref,
  ) => {
    return (
      <div className={`flex items-center justify-between gap-4 ${className}`}>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <span className="text-sm font-medium text-white">{label}</span>
            )}
            {description && (
              <span className="text-xs text-gray-400">{description}</span>
            )}
          </div>
        )}
        <label
          className={`relative inline-flex items-center cursor-pointer shrink-0 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            type="checkbox"
            className="sr-only peer"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            ref={ref}
            id={id}
            {...props}
          />
          <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary border border-white/10"></div>
        </label>
      </div>
    );
  },
);

Switch.displayName = 'Switch';
