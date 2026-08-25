import type { ReactNode } from 'react';
import { Card } from '../ui';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** When false, children render without a Card wrapper. */
  card?: boolean;
}

export default function SettingsSection({
  title,
  description,
  children,
  className = '',
  card = true,
}: SettingsSectionProps) {
  return (
    <section className={`space-y-3 ${className}`}>
      <div>
        <h2 className="text-lg font-semibold text-white tracking-tight">
          {title}
        </h2>
        {description ? (
          <p className="text-xs text-white/50 mt-1 leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {card ? (
        <Card variant="glass" className="divide-y divide-white/5">
          {children}
        </Card>
      ) : (
        children
      )}
    </section>
  );
}
