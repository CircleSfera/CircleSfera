import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { BadgeCheck, ShieldCheck } from 'lucide-react';

export type VerificationLevel = 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';

interface VerificationBadgeProps {
  level?: VerificationLevel;
  size?: number;
  className?: string;
}

export default function VerificationBadge({
  level = 'BASIC',
  size = 14,
  className = '',
}: VerificationBadgeProps) {
  if (level === 'BASIC' || !level) return null;

  const configs: Record<
    VerificationLevel,
    { icon: LucideIcon | null; color: string; tooltip: string }
  > = {
    BASIC: { icon: null, color: '', tooltip: '' },
    VERIFIED: {
      icon: BadgeCheck,
      color: 'fill-blue-400',
      tooltip: 'Cuenta Verificada',
    },
    BUSINESS: {
      icon: ShieldCheck,
      color: 'fill-gray-400',
      tooltip: 'Empresa Oficial',
    },
    ELITE: {
      icon: BadgeCheck,
      color: 'fill-yellow-400',
      tooltip: 'Creador Elite',
    },
  };

  const config = configs[level];
  const Icon = config.icon;

  if (!Icon) return null;

  return (
    <div
      className={clsx(
        'inline-flex items-center justify-center shrink-0',
        className,
      )}
      title={config.tooltip}
    >
      <Icon 
        size={size} 
        className={clsx(
          config.color, 
          'text-white drop-shadow-sm'
        )} 
      />
    </div>
  );
}
