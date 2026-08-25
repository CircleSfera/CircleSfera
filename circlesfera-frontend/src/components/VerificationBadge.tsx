import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  if (level === 'BASIC' || !level) return null;

  const configs: Record<
    VerificationLevel,
    { icon: LucideIcon | null; color: string; tooltipKey: string }
  > = {
    BASIC: { icon: null, color: '', tooltipKey: '' },
    VERIFIED: {
      icon: BadgeCheck,
      color: 'fill-blue-400',
      tooltipKey: 'profile.badges.premium',
    },
    BUSINESS: {
      icon: ShieldCheck,
      color: 'fill-yellow-400',
      tooltipKey: 'profile.badges.business',
    },
    ELITE: {
      icon: BadgeCheck,
      color: 'fill-red-500',
      tooltipKey: 'profile.badges.elite',
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
      title={t(config.tooltipKey, config.tooltipKey)}
    >
      <Icon
        size={size}
        className={clsx(config.color, 'text-white drop-shadow-sm')}
      />
    </div>
  );
}
