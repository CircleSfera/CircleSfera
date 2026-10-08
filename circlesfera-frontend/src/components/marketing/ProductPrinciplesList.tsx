import type { LucideIcon } from 'lucide-react';
import {
  Eye,
  Fingerprint,
  Scale,
  Shield,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const PRINCIPLES: { key: string; icon: LucideIcon }[] = [
  { key: 'control', icon: SlidersHorizontal },
  { key: 'transparency', icon: Eye },
  { key: 'no_suppression', icon: Shield },
  { key: 'moderation', icon: Scale },
  { key: 'data', icon: Fingerprint },
];

/** The five product principles, numbered, in one panel. */
export function ProductPrinciplesList() {
  const { t } = useTranslation();

  return (
    <ol className="overflow-hidden rounded-3xl glass-panel divide-y divide-white/8">
      {PRINCIPLES.map(({ key, icon: Icon }, index) => (
        <li key={key} className="flex gap-4 p-5 sm:gap-6 sm:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary">
            <Icon size={22} strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold tabular-nums text-white/40">
              {String(index + 1).padStart(2, '0')}
            </p>
            <h3 className="mt-0.5 text-lg font-bold tracking-tight text-white sm:text-xl">
              {t(`landing.principles.items.${key}.title`)}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-white/60 sm:text-base">
              {t(`landing.principles.items.${key}.desc`)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
