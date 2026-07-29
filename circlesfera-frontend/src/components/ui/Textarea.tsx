import React, { forwardRef, useId } from 'react';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', label, error, id, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id || generatedId;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          className={`flex min-h-20 w-full rounded-xl border bg-white/5 backdrop-blur-md px-4 py-3 text-sm text-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:border-brand-primary/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-inner ${
            error
              ? 'border-red-500/50 focus-visible:border-red-500/50 focus-visible:ring-red-500/40'
              : 'border-white/10 hover:border-white/20 hover:bg-white/10'
          } ${className}`}
          {...props}
        />
        {error && (
          <p className="text-xs text-red-400 ml-1 font-medium">{error}</p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
