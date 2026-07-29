import { ChevronDown } from 'lucide-react';
import React, { forwardRef, useId } from 'react';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', label, error, id, children, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            className={`flex h-11 w-full appearance-none rounded-xl border bg-white/5 backdrop-blur-md px-4 py-2 pr-10 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:border-brand-primary/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-inner ${
              error
                ? 'border-red-500/50 focus-visible:border-red-500/50 focus-visible:ring-red-500/40'
                : 'border-white/10 hover:border-white/20 hover:bg-white/10'
            } ${className}`}
            {...props}
          >
            {children}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
            <ChevronDown size={18} />
          </div>
        </div>
        {error && (
          <p className="text-xs text-red-400 ml-1 font-medium">{error}</p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
