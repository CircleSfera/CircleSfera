import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'white' | 'ghost';
type Size = 'md' | 'lg';

const variantClass: Record<Variant, string> = {
  primary:
    'text-white border border-brand-primary/30 bg-linear-to-r from-brand-secondary to-brand-primary shadow-[0_4px_16px_-2px_rgba(var(--brand-primary-rgb),0.45)]',
  secondary: 'text-white bg-white/8 border border-white/10 hover:bg-white/12',
  white:
    'bg-white text-black font-bold border border-white/20 hover:bg-white/90',
  ghost:
    'text-white/70 hover:text-white bg-transparent border border-transparent',
};

const sizeClass: Record<Size, string> = {
  md: 'h-11 px-5 text-sm font-semibold',
  lg: 'h-12 px-6 text-sm font-bold',
};

const baseClass =
  'inline-flex items-center justify-center gap-2 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 disabled:opacity-50 disabled:pointer-events-none';

interface BaseProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

type LinkProps = BaseProps & {
  to: string;
  type?: never;
  disabled?: never;
  onClick?: never;
};

type BtnProps = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    to?: undefined;
  };

export type MarketingCTAProps = LinkProps | BtnProps;

export function MarketingCTA(props: MarketingCTAProps) {
  const { variant = 'primary', className, children } = props;
  const size = props.size ?? (variant === 'primary' ? 'lg' : 'md');
  const classes = clsx(
    baseClass,
    sizeClass[size],
    variantClass[variant],
    className,
  );

  if ('to' in props && props.to) {
    return (
      <Link to={props.to} className={classes}>
        {children}
      </Link>
    );
  }

  const { type = 'button', size: _size, ...btnRest } = props as BtnProps;
  return (
    <button type={type} className={classes} {...btnRest}>
      {children}
    </button>
  );
}
