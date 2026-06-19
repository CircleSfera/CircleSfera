import { Loader2 } from 'lucide-react';
import React, { forwardRef } from 'react';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'primary'
    | 'secondary'
    | 'danger'
    | 'ghost'
    | 'outline'
    | 'white'
    | 'success'
    | 'warning';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-lg font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]';

    const variants = {
      primary:
        'bg-blue-600 text-white hover:bg-blue-500 focus:ring-blue-500 shadow-sm shadow-blue-900/20',
      secondary: 'bg-white/10 text-white hover:bg-white/20 focus:ring-white/20',
      danger:
        'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 focus:ring-red-500',
      ghost:
        'bg-transparent text-gray-300 hover:text-white hover:bg-white/5 focus:ring-white/20',
      outline:
        'bg-transparent text-white border border-white/10 hover:bg-white/5 focus:ring-white/20',
      white:
        'bg-white text-black hover:bg-zinc-200 focus:ring-white/50 shadow-lg shadow-white/20 hover:shadow-white/40',
      success:
        'bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white focus:ring-green-500',
      warning:
        'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500 hover:text-white focus:ring-yellow-500',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-10 px-4 py-2 text-sm',
      lg: 'h-12 px-6 text-base',
      icon: 'h-10 w-10',
    };

    const classes = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button };
