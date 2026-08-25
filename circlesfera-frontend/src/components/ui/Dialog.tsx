import { X } from 'lucide-react';
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

/** Same brand wash as BrandAmbientBackground + dim — keeps Dialog in sync with Home / Account Center. */
const DIALOG_OVERLAY_BACKGROUND = `
  linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)),
  radial-gradient(circle at 12% 12%, rgba(255, 87, 87, 0.10) 0%, transparent 50%),
  radial-gradient(circle at 88% 88%, rgba(140, 82, 255, 0.16) 0%, transparent 55%),
  linear-gradient(135deg, rgba(255, 87, 87, 0.06) 0%, rgba(140, 82, 255, 0.12) 100%),
  var(--surface-base)
`;

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  maxWidth = 'md',
}: DialogProps) {
  const overlayRef = useFocusTrap<HTMLDivElement>(isOpen);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-[95%]',
  };

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: Backdrop click is mouse-only, keyboard handled globally via Escape
    <div
      ref={overlayRef}
      onMouseDown={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ background: DIALOG_OVERLAY_BACKGROUND }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'dialog-title' : undefined}
        className={`w-full ${maxWidthClasses[maxWidth]} relative modal-glass rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 ${className}`}
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
            <h2
              id="dialog-title"
              className="text-lg font-bold text-white tracking-tight"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-2 min-h-11 min-w-11 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        )}
        {!title && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute top-4 right-4 z-10 p-2 min-h-11 min-w-11 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        )}
        <div className="p-4 overflow-y-auto custom-scrollbar">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
