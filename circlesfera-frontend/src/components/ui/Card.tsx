import React, { forwardRef } from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'ghost';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', variant = 'glass', children, ...props }, ref) => {
    const baseStyles = 'rounded-xl overflow-hidden';
    const variants = {
      default: 'bg-surface-elevated border border-white/10',
      glass: 'glass-panel border border-white/5',
      ghost: 'bg-transparent',
    };

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';
