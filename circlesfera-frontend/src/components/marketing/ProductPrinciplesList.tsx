import type { LucideIcon } from 'lucide-react';
import {
  Eye,
  Fingerprint,
  Scale,
  Shield,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BentoCard } from './BentoCard';

export const PRINCIPLES: { key: string; icon: LucideIcon }[] = [
  { key: 'control', icon: SlidersHorizontal },
  { key: 'transparency', icon: Eye },
  { key: 'no_suppression', icon: Shield },
  { key: 'moderation', icon: Scale },
  { key: 'data', icon: Fingerprint },
];

/**
 * Product principles — Bento Grid implementation.
 */
export function ProductPrinciplesList() {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {PRINCIPLES.map(({ key, icon }) => (
        <BentoCard
          key={key}
          title={t(`landing.principles.items.${key}.title`)}
          description={t(`landing.principles.items.${key}.desc`)}
          icon={icon}
          size={key === 'moderation' ? 'large' : 'small'}
        />
      ))}
    </div>
  );
}
