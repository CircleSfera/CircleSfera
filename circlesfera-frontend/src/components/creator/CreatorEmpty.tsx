import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Card } from '../ui';

interface CreatorEmptyProps {
  icon?: LucideIcon;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  children?: ReactNode;
}

/** Quiet empty state matching Settings cards (glass, sentence case, no glow). */
export default function CreatorEmpty({
  icon: Icon,
  title,
  message,
  action,
  children,
}: CreatorEmptyProps) {
  return (
    <Card variant="glass" className="px-6 py-10 text-center">
      {Icon ? (
        <Icon
          size={28}
          className="mx-auto mb-3 text-brand-primary"
          aria-hidden
        />
      ) : null}
      <p className="text-sm font-medium text-white">{title}</p>
      {message ? (
        <p className="text-xs text-white/50 mt-1 leading-relaxed max-w-sm mx-auto">
          {message}
        </p>
      ) : null}
      {action ? (
        <Button
          variant="primary"
          className="mt-5 min-h-11"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ) : null}
      {children}
    </Card>
  );
}
