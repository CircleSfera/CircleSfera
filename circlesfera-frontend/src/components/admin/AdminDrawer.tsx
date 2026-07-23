import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '../ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

/** Full-screen on mobile; right panel on md+. */
export default function AdminDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'md',
}: Props) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const widthClasses = {
    md: 'md:max-w-md',
    lg: 'md:max-w-2xl',
    xl: 'md:max-w-4xl',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className={`fixed inset-y-0 right-0 z-50 w-full ${widthClasses[width]} bg-surface-elevated border-l border-white/10 shadow-2xl flex flex-col pt-[env(safe-area-inset-top)]`}
          >
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/2">
              <div className="min-w-0 pr-2">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-sm text-gray-300 mt-0.5 truncate">
                    {subtitle}
                  </p>
                )}
              </div>
              <Button
                onClick={onClose}
                variant="secondary"
                size="icon"
                className="w-11 h-11 text-gray-300 hover:text-white border-transparent shrink-0"
              >
                <X size={20} />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
