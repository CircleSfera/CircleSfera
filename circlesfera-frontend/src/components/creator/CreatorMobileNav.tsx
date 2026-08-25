import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CreatorNavList from './CreatorNavList';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** Studio section list for mobile. App chrome (Home, Create, Profile) is BottomNav. */
export function CreatorMobileDrawer({ isOpen, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/80 md:hidden"
          />
          <motion.aside
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed inset-x-0 bottom-0 z-[60] max-h-[85vh] bg-surface-elevated border-t border-white/10 flex flex-col md:hidden pb-[env(safe-area-inset-bottom)] rounded-t-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={t('creator.nav_label', 'Creator Studio')}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-12 h-1.5 bg-white/20 rounded-full" />
            </div>

            <div className="px-4 py-2 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="w-11 h-11 flex items-center justify-center text-white/50 hover:text-white rounded-xl hover:bg-white/5"
                aria-label={t('common.close', 'Close')}
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 py-2 pb-8">
              <CreatorNavList onNavigate={onClose} />
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
