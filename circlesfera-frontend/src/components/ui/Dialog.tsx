import { X } from 'lucide-react';
import React, { useEffect } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

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

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Backdrop click is mouse-only, keyboard handled globally via Escape
    <div
      ref={overlayRef}
      onMouseDown={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'dialog-title' : undefined}
        className={`w-full ${maxWidthClasses[maxWidth]} bg-surface-elevated border border-white/10 rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 ${className}`}
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
              className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        )}
        {!title && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        )}
        <div className="p-4 overflow-y-auto custom-scrollbar">{children}</div>
      </div>
    </div>
  );
}
