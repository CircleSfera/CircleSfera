import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Button } from '../ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Full-screen on mobile; right panel on md+. Accessible dialog drawer. */
export default function AdminDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'md',
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      // Focus first focusable / panel after paint
      requestAnimationFrame(() => {
        const root = panelRef.current;
        if (!root) return;
        const first = root.querySelector<HTMLElement>(FOCUSABLE);
        (first || root).focus();
      });
    } else {
      document.body.style.overflow = 'unset';
      previousFocusRef.current?.focus?.();
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
      if (nodes.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

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
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className={`fixed inset-y-0 right-0 z-50 w-full ${widthClasses[width]} bg-surface-elevated border-l border-white/10 shadow-2xl flex flex-col pt-[env(safe-area-inset-top)] outline-none`}
          >
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/2">
              <div className="min-w-0 pr-2">
                <h2
                  id={titleId}
                  className="text-lg sm:text-xl font-semibold text-white tracking-tight truncate"
                >
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
                aria-label="Cerrar"
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
