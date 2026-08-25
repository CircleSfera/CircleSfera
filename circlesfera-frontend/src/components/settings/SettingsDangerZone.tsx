import { AlertTriangle } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog } from '../ui';

interface SettingsDangerZoneProps {
  title: string;
  description: string;
  actionLabel: string;
  confirmTitle: string;
  confirmBody: string;
  confirmLabel: string;
  onConfirm: () => void;
  isLoading?: boolean;
  variant?: 'danger' | 'warning';
  secondaryAction?: ReactNode;
}

export default function SettingsDangerZone({
  title,
  description,
  actionLabel,
  confirmTitle,
  confirmBody,
  confirmLabel,
  onConfirm,
  isLoading = false,
  variant = 'danger',
  secondaryAction,
}: SettingsDangerZoneProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const borderClass =
    variant === 'danger'
      ? 'border-brand-secondary/20 bg-brand-secondary/5'
      : 'border-brand-accent/20 bg-brand-accent/5';
  const titleClass =
    variant === 'danger' ? 'text-brand-secondary' : 'text-brand-accent';

  return (
    <>
      <div className={`rounded-xl border p-4 space-y-3 ${borderClass}`}>
        <h3
          className={`text-sm font-semibold flex items-center gap-2 ${titleClass}`}
        >
          <AlertTriangle size={14} aria-hidden />
          {title}
        </h3>
        <p className="text-xs text-white/50 leading-relaxed">{description}</p>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant={variant === 'danger' ? 'danger' : 'outline'}
            isLoading={isLoading}
            onClick={() => setOpen(true)}
            className="w-full min-h-11 text-sm font-semibold"
          >
            {actionLabel}
          </Button>
          {secondaryAction}
        </div>
      </div>

      <Dialog
        isOpen={open}
        onClose={() => setOpen(false)}
        title={confirmTitle}
        maxWidth="sm"
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-white/70 leading-relaxed">{confirmBody}</p>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="min-h-11"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant={variant === 'danger' ? 'danger' : 'primary'}
              isLoading={isLoading}
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
              className="min-h-11"
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
