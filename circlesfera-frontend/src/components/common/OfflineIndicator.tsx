import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-100 bg-red-500/90 backdrop-blur-md text-white px-4 py-2 rounded-full shadow-lg shadow-red-500/20 flex items-center gap-2 border border-red-400/50"
        >
          <WifiOff size={16} />
          <span className="text-sm font-semibold tracking-wide">
            Sin conexión a internet
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
