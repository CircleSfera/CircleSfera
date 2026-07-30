import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setWasOffline(true);
      setIsOffline(false);
      // Hide the "back online" state after 2.5s
      setTimeout(() => setWasOffline(false), 2500);
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showBanner = isOffline || wasOffline;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          key={isOffline ? 'offline' : 'online'}
          initial={{ y: -60, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -60, opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-9999 flex items-center gap-2.5 px-4 py-2.5 rounded-full"
          style={
            isOffline
              ? {
                  background:
                    'linear-gradient(135deg, rgba(30,6,6,0.95) 0%, rgba(20,4,4,0.98) 100%)',
                  border: '1px solid rgba(239,68,68,0.35)',
                  boxShadow:
                    '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(239,68,68,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }
              : {
                  background:
                    'linear-gradient(135deg, rgba(4,22,12,0.95) 0%, rgba(3,15,8,0.98) 100%)',
                  border: '1px solid rgba(34,197,94,0.35)',
                  boxShadow:
                    '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(34,197,94,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }
          }
        >
          <span className="relative flex items-center justify-center">
            <span
              className="absolute inline-flex rounded-full animate-ping opacity-60"
              style={{
                width: '20px',
                height: '20px',
                background: isOffline
                  ? 'rgba(239,68,68,0.5)'
                  : 'rgba(34,197,94,0.5)',
              }}
            />
            {isOffline ? (
              <WifiOff size={14} className="relative text-red-400" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-label="Conexión restaurada"
                role="img"
                className="w-3.5 h-3.5 relative text-green-400"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <title>Conexión restaurada</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </span>
          <span
            className="text-sm font-semibold tracking-wide"
            style={{
              color: isOffline
                ? 'rgba(252,165,165,0.95)'
                : 'rgba(134,239,172,0.95)',
            }}
          >
            {isOffline ? 'Sin conexión a internet' : 'Conexión restaurada'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
