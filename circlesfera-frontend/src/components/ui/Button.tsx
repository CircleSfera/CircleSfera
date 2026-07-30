import { motion } from 'framer-motion';
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
    | 'warning'
    | 'gradient';
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
      style,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-xl font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none';

    const variants: Record<
      NonNullable<ButtonProps['variant']>,
      { className: string; style?: React.CSSProperties }
    > = {
      primary: {
        className:
          'text-white border border-brand-primary/30 focus-visible:ring-brand-primary/60',
        style: {
          background: 'linear-gradient(90deg, #ff5757 0%, #8c52ff 100%)',
          boxShadow:
            '0 4px 16px -2px rgba(140,82,255,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
        },
      },
      secondary: {
        className:
          'bg-white/10 text-white hover:bg-white/18 focus-visible:ring-white/30 border border-white/8',
      },
      danger: {
        className:
          'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 focus-visible:ring-red-500/60',
      },
      ghost: {
        className:
          'bg-transparent text-gray-300 hover:text-white hover:bg-white/6 focus-visible:ring-white/20',
      },
      outline: {
        className:
          'bg-transparent text-white border border-white/12 hover:bg-white/6 focus-visible:ring-white/20',
      },
      white: {
        className: 'text-black font-bold focus-visible:ring-white/60',
        style: {
          background: 'linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%)',
          boxShadow:
            '0 4px 20px rgba(255,255,255,0.2), inset 0 1px 0 rgba(255,255,255,0.9)',
        },
      },
      success: {
        className:
          'bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white border border-green-500/20 focus-visible:ring-green-500/60',
      },
      warning: {
        className:
          'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500 hover:text-white border border-yellow-500/20 focus-visible:ring-yellow-500/60',
      },
      gradient: {
        className:
          'text-white border-0 focus-visible:ring-brand-primary/60 btn-gradient-brand',
        style: {
          background: 'linear-gradient(90deg, #ff5757 0%, #8c52ff 100%)',
          boxShadow:
            '0 6px 24px -4px rgba(140,82,255,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
        },
      },
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-10 px-4 py-2 text-sm gap-2',
      lg: 'h-12 px-6 text-base gap-2',
      icon: 'h-10 w-10',
    };

    const v = variants[variant];
    const classes = `${baseStyles} ${v.className} ${sizes[size]} ${className}`;
    const combinedStyle = { ...v.style, ...style };

    return (
      <motion.button
        ref={ref}
        className={classes}
        style={combinedStyle}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        whileTap={disabled || isLoading ? undefined : { scale: 0.96 }}
        whileHover={
          disabled || isLoading
            ? undefined
            : variant === 'primary' ||
                variant === 'gradient' ||
                variant === 'white'
              ? { scale: 1.03, y: -1 }
              : { scale: 1.02 }
        }
        {...(props as any)}
      >
        {isLoading && <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />}
        {children}
      </motion.button>
    );
  },
);

Button.displayName = 'Button';

export { Button };
