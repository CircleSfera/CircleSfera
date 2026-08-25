import { Home, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui';

interface OnboardingEmptyCircleProps {
  onRetry: () => void;
}

/**
 * Empty suggestions on onboarding step 2 — same row density as Home
 * suggestions, without a nested empty-state card.
 */
export function OnboardingEmptyCircle({ onRetry }: OnboardingEmptyCircleProps) {
  const { t } = useTranslation();

  const places = [
    {
      icon: Home,
      title: t('nav.home', 'Home'),
      desc: t(
        'onboarding.empty_home_desc',
        'Suggested creators appear next to your feed.',
      ),
    },
    {
      icon: Search,
      title: t('nav.explore', 'Explore'),
      desc: t(
        'onboarding.empty_explore_desc',
        'Trending posts from the community.',
      ),
    },
  ] as const;

  return (
    <div data-testid="onboarding-empty-suggestions">
      <div className="px-3 pt-3 pb-2">
        <p className="font-black text-white/45 text-xs uppercase tracking-wider">
          {t('onboarding.empty_places_label', 'Where to find people')}
        </p>
        <p className="text-sm text-white/70 mt-1.5 leading-snug">
          {t(
            'onboarding.empty_message',
            'No creators to follow yet. Enter CircleSfera and find people from Home and Explore.',
          )}
        </p>
      </div>

      <ul className="divide-y divide-white/8">
        {places.map((place) => {
          const Icon = place.icon;
          return (
            <li
              key={place.title}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <div
                className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center bg-brand-primary/15 border border-brand-primary/25"
                aria-hidden
              >
                <Icon size={18} className="text-brand-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-white truncate">
                  {place.title}
                </p>
                <p className="text-xs text-white/45 truncate">{place.desc}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="px-3 py-3 border-t border-white/8">
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={onRetry}
          data-testid="onboarding-retry-suggestions"
          className="w-full font-semibold"
        >
          <RefreshCw size={16} aria-hidden />
          {t('onboarding.retry_suggestions', 'Refresh suggestions')}
        </Button>
      </div>
    </div>
  );
}
