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
      {/* Outer Glow */}
      <div
        className={`absolute rounded-full blur-xl bg-brand-primary/30 animate-pulse`}
        style={{ width: sizePx[size], height: sizePx[size] }}
      />

      {/* Spinning Gradient Ring */}
      <motion.div
        style={{
          width: sizePx[size],
          height: sizePx[size],
          borderWidth: size === 'sm' ? 3 : 4,
        }}
        className="rounded-full border-l-transparent border-t-brand-primary border-r-brand-secondary border-b-brand-accent box-border"
        animate={{ rotate: 360 }}
        transition={{
          duration: 1,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'linear',
        }}
      />
    </div>
  );
}

interface LoadingPageProps {
  message?: string;
}

export function LoadingPage({ message = 'Loading...' }: LoadingPageProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-gray-300 font-medium animate-pulse">{message}</p>
    </div>
  );
}

// Base Skeleton Component
interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle' | 'text';
}

export function Skeleton({ className = '', variant = 'rect' }: SkeletonProps) {
  const baseClasses = 'bg-white/5 relative overflow-hidden';
  const variantClasses = {
    rect: 'rounded-lg',
    circle: 'rounded-full',
    text: 'rounded h-4',
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {/* Shimmer effect */}
      <motion.div
        className="absolute inset-0 bg-linear-to-r from-transparent via-white/5 to-transparent shadow-[0_0_20px_rgba(255,255,255,0.05)]"
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{
          repeat: Number.POSITIVE_INFINITY,
          duration: 1.5,
          ease: 'linear',
        }}
      />
    </div>
  );
}

// Post Skeleton
export function PostSkeleton() {
  return (
    <div className="glass-panel-post rounded-lg overflow-hidden mb-6">
      <div className="p-4 flex items-center gap-3">
        <Skeleton variant="circle" className="w-10 h-10" />
        <div className="space-y-2">
          <Skeleton variant="text" className="w-24" />
          <Skeleton variant="text" className="w-16 h-3 opacity-50" />
        </div>
      </div>
      <Skeleton className="aspect-4/5 w-full rounded-none" />
      <div className="p-4 space-y-4">
        <div className="flex gap-4">
          <Skeleton variant="circle" className="w-6 h-6" />
          <Skeleton variant="circle" className="w-6 h-6" />
          <Skeleton variant="circle" className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <Skeleton variant="text" className="w-3/4" />
          <Skeleton variant="text" className="w-1/2" />
        </div>
      </div>
    </div>
  );
}

// Story Skeleton
export function StorySkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 min-w-[72px]">
      <div className="w-16 h-16 rounded-full border-2 border-white/10 p-1">
        <Skeleton variant="circle" className="w-full h-full" />
      </div>
      <Skeleton variant="text" className="w-12 h-2" />
    </div>
  );
}

// Profile Header Skeleton
export function ProfileSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4">
      <div className="glass-panel rounded-4xl p-6 md:p-8 mb-6 overflow-hidden relative">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8 md:gap-10">
          <Skeleton variant="circle" className="w-24 h-24 md:w-32 md:h-32" />
          <div className="flex-1 space-y-4 w-full text-center md:text-left">
            <div className="flex flex-col md:flex-row gap-4 items-center md:items-start">
              <Skeleton variant="text" className="w-48 h-8" />
              <div className="flex gap-2">
                <Skeleton className="w-24 h-9" />
                <Skeleton className="w-9 h-9" />
              </div>
            </div>
            <div className="flex justify-center md:justify-start gap-10">
              <Skeleton variant="text" className="w-16 h-6" />
              <Skeleton variant="text" className="w-16 h-6" />
              <Skeleton variant="text" className="w-16 h-6" />
            </div>
            <div className="space-y-2">
              <Skeleton variant="text" className="w-full md:w-3/4" />
              <Skeleton variant="text" className="w-2/3 md:w-1/2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
