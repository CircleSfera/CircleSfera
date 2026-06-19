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
            className="block text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            className={`flex h-10 w-full appearance-none rounded-lg border bg-zinc-900/50 px-3 py-2 pr-8 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all ${
              error
                ? 'border-red-500/50 focus-visible:ring-red-500/50'
                : 'border-white/10 hover:border-white/20'
            } ${className}`}
            {...props}
          >
            {children}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
            <ChevronDown size={16} />
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
