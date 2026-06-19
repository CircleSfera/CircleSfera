import { AlertTriangle, X } from 'lucide-react';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
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
}: ConfirmModalProps) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} maxWidth="sm">
      {/* Header */}
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

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              {title}
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed px-2">
              {message}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-4 flex flex-col gap-3">
        <Button
          onClick={onConfirm}
          isLoading={isLoading}
          variant={isDestructive ? 'danger' : 'white'}
          className="w-full font-black text-sm tracking-wide uppercase py-3"
        >
          {confirmText}
        </Button>

        <Button
          onClick={onClose}
          disabled={isLoading}
          variant="ghost"
          className="w-full font-bold text-sm bg-white/5 hover:bg-white/10 text-gray-400 py-3"
        >
          {cancelText}
        </Button>
      </div>
    </Dialog>
  );
}
