import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional input value when `showInput` is true. */
  onConfirm: (inputValue?: string) => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  /** Optional text field (e.g. rejection reason). */
  showInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputRequired?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = true,
  isLoading = false,
  showInput = false,
  inputLabel = 'Motivo',
  inputPlaceholder = '',
  inputRequired = false,
}: ConfirmModalProps) {
  const inputId = useId();
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (!isOpen) setInputValue('');
  }, [isOpen]);

  const canConfirm =
    !isLoading &&
    (!showInput || !inputRequired || inputValue.trim().length > 0);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} maxWidth="sm">
      <div className="relative pt-4 pb-4 px-2 text-center">
        <div className="flex flex-col items-center text-center gap-4">
          <div
            className={`p-4 rounded-full ${isDestructive ? 'bg-red-500/10 text-red-500' : 'bg-white/10 text-white'} ring-1 ring-white/10 shadow-inner`}
          >
            {isDestructive ? (
              <AlertTriangle size={28} strokeWidth={1.5} />
            ) : (
              <X size={28} strokeWidth={1.5} />
            )}
          </div>

          <div className="space-y-2 w-full">
            <h2 className="text-xl font-semibold text-white tracking-tight">
              {title}
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed px-2">
              {message}
            </p>
          </div>

          {showInput && (
            <label className="w-full text-left space-y-1.5 px-1">
              <span className="text-xs font-semibold text-gray-400">
                {inputLabel}
              </span>
              <textarea
                id={inputId}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={inputPlaceholder}
                rows={3}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-primary min-h-24"
              />
            </label>
          )}
        </div>
      </div>

      <div className="pt-4 flex flex-col gap-3">
        <Button
          onClick={() => onConfirm(showInput ? inputValue.trim() : undefined)}
          isLoading={isLoading}
          disabled={!canConfirm}
          variant={isDestructive ? 'danger' : 'white'}
          className="w-full font-semibold text-sm tracking-wide min-h-11 py-3"
        >
          {confirmText}
        </Button>

        <Button
          onClick={onClose}
          disabled={isLoading}
          variant="ghost"
          className="w-full font-semibold text-sm bg-white/5 hover:bg-white/10 text-gray-300 min-h-11 py-3"
        >
          {cancelText}
        </Button>
      </div>
    </Dialog>
  );
}
