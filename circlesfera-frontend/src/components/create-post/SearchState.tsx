import { RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * What a search list of the editor shows instead of results: a plain message
 * while loading or when nothing was found, and a message with a way to try
 * again when the search itself failed.
 */

const box =
  'flex flex-col items-center justify-center gap-3 px-4 py-6 text-center text-sm font-medium text-white/50';

export function SearchMessage({
  children,
  busy = false,
}: {
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${box} ${busy ? 'animate-pulse' : ''}`}
    >
      {children}
    </div>
  );
}

export function SearchError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div role="alert" className={box}>
      <p className="text-white/70">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 px-4 inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/16 text-white text-sm font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25"
      >
        <RotateCw size={16} aria-hidden />
        {t('common.try_again')}
      </button>
    </div>
  );
}
