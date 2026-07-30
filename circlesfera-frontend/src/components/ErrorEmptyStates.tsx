import { motion } from 'framer-motion';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-10 px-6 text-center mx-auto max-w-sm rounded-2xl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      style={{
        background:
          'linear-gradient(135deg, rgba(20,10,30,0.7) 0%, rgba(12,8,20,0.8) 100%)',
        border: '1px solid rgba(239,68,68,0.15)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 40px rgba(239,68,68,0.04)',
      }}
    >
      {/* Icon with brand glow circle */}
      <div className="relative mb-5">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background:
              'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(131,58,180,0.1) 100%)',
            border: '1px solid rgba(239,68,68,0.2)',
            boxShadow: '0 4px 20px rgba(239,68,68,0.15)',
          }}
        >
          <svg
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            className="w-7 h-7 text-red-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
      </div>

      <h3 className="text-base font-bold text-white mb-1.5 tracking-tight">
        {title}
      </h3>
      <p className="text-zinc-500 mb-6 text-sm leading-relaxed">{message}</p>

      {onRetry && (
        <motion.button
          type="button"
          onClick={onRetry}
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.96 }}
          className="px-6 py-2.5 text-sm font-bold text-white rounded-xl transition-all"
          style={{
            background:
              'linear-gradient(135deg, rgba(131,58,180,0.25) 0%, rgba(64,93,230,0.15) 100%)',
            border: '1px solid rgba(131,58,180,0.3)',
            boxShadow: '0 4px 16px rgba(131,58,180,0.15)',
          }}
        >
          Try Again
        </motion.button>
      )}
    </motion.div>
  );
}

interface EmptyStateProps {
  icon?:
    | 'posts'
    | 'stories'
    | 'comments'
    | 'followers'
    | 'notifications'
    | 'search';
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const iconPaths: Record<NonNullable<EmptyStateProps['icon']>, string> = {
  posts:
    'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  stories: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  comments:
    'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  followers:
    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  notifications:
    'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
};

export function EmptyState({
  icon = 'posts',
  title,
  message,
  action,
}: EmptyStateProps) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-10 px-6 text-center mx-auto max-w-sm rounded-2xl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      style={{
        background:
          'linear-gradient(135deg, rgba(15,10,25,0.6) 0%, rgba(10,7,18,0.7) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      }}
    >
      {/* Icon with gradient circle */}
      <div className="relative mb-5">
        {/* Glow behind icon */}
        <div
          className="absolute inset-0 rounded-2xl blur-xl opacity-50"
          style={{
            background:
              'radial-gradient(circle, rgba(131,58,180,0.3) 0%, transparent 70%)',
            transform: 'scale(1.3)',
          }}
        />
        <div
          className="relative w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background:
              'linear-gradient(135deg, rgba(131,58,180,0.18) 0%, rgba(64,93,230,0.12) 100%)',
            border: '1px solid rgba(131,58,180,0.2)',
            boxShadow: '0 4px 20px rgba(131,58,180,0.12)',
          }}
        >
          <svg
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            className="w-7 h-7"
            style={{ color: 'rgba(167,139,250,0.8)' }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d={iconPaths[icon]}
            />
          </svg>
        </div>
      </div>

      <h3 className="text-base font-bold text-white mb-1.5 tracking-tight">
        {title}
      </h3>
      {message && (
        <p className="text-zinc-500 mb-6 text-sm leading-relaxed">{message}</p>
      )}
      {action && (
        <motion.button
          type="button"
          onClick={action.onClick}
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.96 }}
          className="px-6 py-2.5 text-sm font-bold text-white rounded-xl transition-all"
          style={{
            background:
              'linear-gradient(135deg, rgba(131,58,180,0.25) 0%, rgba(64,93,230,0.15) 100%)',
            border: '1px solid rgba(131,58,180,0.3)',
            boxShadow: '0 4px 16px rgba(131,58,180,0.15)',
          }}
        >
          {action.label}
        </motion.button>
      )}
    </motion.div>
  );
}
