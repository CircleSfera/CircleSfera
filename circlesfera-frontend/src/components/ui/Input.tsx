import React, { forwardRef, useId } from 'react';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, icon, rightElement, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-bold text-gray-400/80 uppercase tracking-widest mb-1 px-0.5"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3.5 text-gray-500 pointer-events-none z-10">
              {icon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`
              flex h-12 w-full rounded-xl px-4 text-sm text-white
              placeholder:text-gray-500
              disabled:cursor-not-allowed disabled:opacity-50
              transition-all duration-200
              outline-none
              ${error ? 'border-red-500/50' : ''}
              ${icon ? 'pl-11' : ''}
              ${rightElement ? 'pr-11' : ''}
              ${className}
            `}
            style={{
              background: error
                ? 'rgba(239,68,68,0.06)'
                : 'rgba(255,255,255,0.04)',
              border: error
                ? '1px solid rgba(239,68,68,0.45)'
                : '1px solid rgba(255,255,255,0.09)',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
            }}
            onFocus={(e) => {
              if (!error) {
                e.target.style.background =
                  'rgba(var(--brand-primary-rgb), 0.07)';
                e.target.style.border =
                  '1px solid rgba(var(--brand-primary-rgb), 0.5)';
                e.target.style.boxShadow =
                  '0 0 0 3px rgba(var(--brand-primary-rgb), 0.15), 0 0 16px rgba(var(--brand-primary-rgb), 0.08), inset 0 1px 0 rgba(255,255,255,0.06)';
              } else {
                e.target.style.border = '1px solid rgba(239,68,68,0.6)';
                e.target.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.12)';
              }
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              if (!error) {
                e.target.style.background = 'rgba(255,255,255,0.04)';
                e.target.style.border = '1px solid rgba(255,255,255,0.09)';
                e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.2)';
              } else {
                e.target.style.background = 'rgba(239,68,68,0.06)';
                e.target.style.border = '1px solid rgba(239,68,68,0.45)';
                e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.2)';
              }
              props.onBlur?.(e);
            }}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3.5 z-10">{rightElement}</div>
          )}
        </div>
        {error && (
          <p
            id={`${inputId}-error`}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-400 ml-0.5 mt-1 animate-slide-in-left"
          >
            <span className="inline-block w-1 h-1 rounded-full bg-red-500 shrink-0" />
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

export { Input };
