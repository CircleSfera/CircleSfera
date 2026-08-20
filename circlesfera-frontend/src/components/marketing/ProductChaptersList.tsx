import {
  Clapperboard,
  MessageCircle,
  Radio,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BentoCard } from './BentoCard';

export function ProductChaptersList() {
  const { t } = useTranslation();

  const chapters = [
    { key: 'feed', icon: Sparkles, size: 'large' },
    { key: 'frames', icon: Clapperboard, size: 'tall' },
    { key: 'direct', icon: MessageCircle, size: 'small' },
    { key: 'live', icon: Radio, size: 'small' },
    { key: 'creator', icon: Wallet, size: 'large' },
  ] as const;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto auto-rows-fr">
      {chapters.map((chapter) => (
        <BentoCard
          key={chapter.key}
          title={t(`landing.chapters.items.${chapter.key}.title`)}
          description={t(`landing.chapters.items.${chapter.key}.desc`)}
          icon={chapter.icon}
          size={chapter.size}
        />
      ))}
    </div>
  );
}
