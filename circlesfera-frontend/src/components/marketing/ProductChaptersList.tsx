import {
  Clapperboard,
  MessageCircle,
  Radio,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BentoCard } from './BentoCard';

export function ProductChaptersList() {
  const { t } = useTranslation();

  const chapters = [
    { key: 'feed', icon: Sparkles },
    { key: 'frames', icon: Clapperboard },
    { key: 'direct', icon: MessageCircle },
    { key: 'live', icon: Radio },
    { key: 'creator', icon: Wallet },
  ] as const;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {chapters.map((chapter) => (
        <Link
          key={chapter.key}
          to={`/features/${chapter.key}`}
          className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
        >
          <BentoCard
            title={t(`landing.chapters.items.${chapter.key}.title`)}
            description={t(`landing.chapters.items.${chapter.key}.desc`)}
            icon={chapter.icon}
            className="h-full"
          />
        </Link>
      ))}
    </div>
  );
}
