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
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3 text-gray-500 pointer-events-none">
              {icon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`flex h-11 w-full rounded-xl border bg-white/5 backdrop-blur-md px-4 py-2 text-sm text-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:border-brand-primary/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-inner ${
              error
                ? 'border-red-500/50 focus-visible:border-red-500/50 focus-visible:ring-red-500/40'
                : 'border-white/10 hover:border-white/20 hover:bg-white/10'
            } ${icon ? 'pl-11' : ''} ${rightElement ? 'pr-11' : ''} ${className}`}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3">{rightElement}</div>
          )}
        </div>
        {error && (
          <p
            id={`${inputId}-error`}
            className="text-xs font-bold text-red-400 ml-1 mt-1"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

export { Input };
