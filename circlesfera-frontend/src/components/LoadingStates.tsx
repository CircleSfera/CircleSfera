interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

import { motion } from 'framer-motion';

export function LoadingSpinner({
  size = 'md',
  className = '',
}: LoadingSpinnerProps) {
  const sizePx = {
    sm: 24,
    md: 48,
    lg: 64,
  };

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Outer ambient glow */}
      <div
        className="absolute rounded-full blur-2xl"
        style={{
          width: sizePx[size] * 1.4,
          height: sizePx[size] * 1.4,
          background:
            'radial-gradient(circle, rgba(131,58,180,0.35) 0%, rgba(64,93,230,0.15) 60%, transparent 100%)',
          animation: 'pulse-slow 2.5s ease-in-out infinite',
        }}
      />

      {/* Spinning Gradient Ring */}
      <motion.div
        style={{
          width: sizePx[size],
          height: sizePx[size],
          borderWidth: size === 'sm' ? 2.5 : 3.5,
          borderStyle: 'solid',
          borderColor: 'transparent',
          borderTopColor: '#ff5757',
          borderRightColor: '#8c52ff',
          borderBottomColor: 'transparent',
          borderLeftColor: '#8c52ff',
          boxShadow: '0 0 10px rgba(140,82,255,0.4)',
        }}
        className="rounded-full box-border"
        animate={{ rotate: 360 }}
        transition={{
          duration: 0.9,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'linear',
        }}
      />

      {/* Inner dot */}
      {size !== 'sm' && (
        <div
          className="absolute rounded-full"
          style={{
            width: sizePx[size] * 0.2,
            height: sizePx[size] * 0.2,
            background: 'linear-gradient(90deg, #ff5757, #8c52ff)',
            boxShadow: '0 0 8px rgba(140,82,255,0.7)',
            animation: 'pulse-slow 1.5s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
}

interface LoadingPageProps {
  message?: string;
}

export function LoadingPage({ message = 'Loading...' }: LoadingPageProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <LoadingSpinner size="lg" />
      <p
        className="mt-6 text-sm font-medium tracking-wide"
        style={{
          color: 'rgba(255,255,255,0.5)',
          animation: 'pulse-slow 2s ease-in-out infinite',
        }}
      >
        {message}
      </p>
    </div>
  );
}

// Base Skeleton Component
interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle' | 'text';
}

export function Skeleton({ className = '', variant = 'rect' }: SkeletonProps) {
  const baseClasses = 'relative overflow-hidden';
  const variantClasses = {
    rect: 'rounded-xl',
    circle: 'rounded-full',
    text: 'rounded-md h-4',
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={{ background: 'rgba(255,255,255,0.04)' }}
    >
      {/* Brand shimmer sweep */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(131,58,180,0.07) 30%, rgba(64,93,230,0.05) 60%, transparent 100%)',
        }}
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{
          repeat: Number.POSITIVE_INFINITY,
          duration: 1.8,
          ease: 'linear',
        }}
      />
    </div>
  );
}

// Post Skeleton
export function PostSkeleton() {
  return (
    <div
      className="rounded-2xl overflow-hidden mb-4"
      style={{
        background: 'rgba(13,13,17,0.5)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div className="p-4 flex items-center gap-3">
        <Skeleton variant="circle" className="w-10 h-10 shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" className="w-28 h-3.5" />
          <Skeleton variant="text" className="w-16 h-2.5 opacity-60" />
        </div>
        <Skeleton className="w-6 h-6 rounded-lg opacity-40" />
      </div>
      <Skeleton className="aspect-4/5 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <div className="flex gap-4 items-center">
          <Skeleton variant="circle" className="w-7 h-7" />
          <Skeleton variant="circle" className="w-7 h-7" />
          <Skeleton variant="circle" className="w-7 h-7" />
          <Skeleton className="ml-auto w-7 h-7 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton variant="text" className="w-4/5 h-3" />
          <Skeleton variant="text" className="w-1/2 h-3 opacity-60" />
        </div>
      </div>
    </div>
  );
}

// Story Skeleton
export function StorySkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 min-w-18">
      <div
        className="w-16 h-16 rounded-full p-0.5"
        style={{
          background:
            'linear-gradient(135deg, rgba(131,58,180,0.3) 0%, rgba(64,93,230,0.2) 100%)',
        }}
      >
        <Skeleton
          variant="circle"
          className="w-full h-full border-2 border-surface-base"
        />
      </div>
      <Skeleton variant="text" className="w-12 h-2 rounded-full" />
    </div>
  );
}

// Profile Header Skeleton
export function ProfileSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4">
      <div
        className="rounded-2xl p-6 md:p-8 mb-6 overflow-hidden relative"
        style={{
          background: 'rgba(13,13,17,0.5)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8 md:gap-10">
          <Skeleton
            variant="circle"
            className="w-24 h-24 md:w-32 md:h-32 shrink-0"
          />
          <div className="flex-1 space-y-4 w-full text-center md:text-left">
            <div className="flex flex-col md:flex-row gap-4 items-center md:items-start">
              <Skeleton variant="text" className="w-48 h-8" />
              <div className="flex gap-2">
                <Skeleton className="w-24 h-9 rounded-xl" />
                <Skeleton className="w-9 h-9 rounded-xl" />
              </div>
            </div>
            <div className="flex justify-center md:justify-start gap-10">
              <Skeleton variant="text" className="w-16 h-6" />
              <Skeleton variant="text" className="w-16 h-6" />
              <Skeleton variant="text" className="w-16 h-6" />
            </div>
            <div className="space-y-2">
              <Skeleton variant="text" className="w-full md:w-3/4 h-3" />
              <Skeleton variant="text" className="w-2/3 md:w-1/2 h-3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
