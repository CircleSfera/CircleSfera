import { clsx } from 'clsx';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AppCapture, type CapturedScreen } from './AppCapture';
import { EYEBROW } from './eyebrow';
import { Device } from './LandingPhone';

export const FEATURE_KEYS = [
  'feed',
  'frames',
  'direct',
  'live',
  'creator',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

const SCREENS: Record<FeatureKey, CapturedScreen> = {
  feed: 'story',
  frames: 'frames',
  direct: 'chat',
  live: 'live',
  creator: 'creator',
};

/** A phone on a glow, showing a real screen of the app. */
function CapturePhone({
  screen,
  className,
}: {
  screen: CapturedScreen;
  className?: string;
}) {
  return (
    <div
      className={clsx('relative mx-auto w-full max-w-72', className)}
      aria-hidden="true"
    >
      <div className="absolute -inset-8 rounded-full bg-linear-to-br from-brand-primary/30 via-brand-blue/20 to-brand-secondary/20 blur-3xl pointer-events-none" />
      <Device>
        <AppCapture screen={screen} />
      </Device>
    </div>
  );
}

/** The search screen of the app, on a phone. */
export function ExploreVisual() {
  return <CapturePhone screen="explore" />;
}

/** One feature, as it looks in the app, on a phone. */
export function FeatureVisual({
  feature,
  className,
}: {
  feature: FeatureKey;
  className?: string;
}) {
  return <CapturePhone screen={SCREENS[feature]} className={className} />;
}

/**
 * One block per feature: what you can do with it in a sentence, its
 * picture beside it, and the way to read more. The picture changes side
 * from one block to the next on desktop.
 */
export function FeatureShowcase() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-16 sm:gap-24">
      {FEATURE_KEYS.map((key, index) => (
        <article
          key={key}
          id={`feature-${key}`}
          className="grid scroll-mt-24 items-center gap-8 md:grid-cols-2 md:gap-16"
        >
          <div
            className={clsx(
              'text-center md:text-left',
              index % 2 === 1 && 'md:order-2',
            )}
          >
            <p className={`mb-3 ${EYEBROW}`}>
              {t(`landing.chapters.items.${key}.title`)}
            </p>
            <h3 className="text-3xl font-black leading-[1.08] tracking-tight text-white sm:text-4xl">
              {t(`landing.chapters.items.${key}.headline`)}
            </h3>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-white/65 sm:text-lg md:mx-0">
              {t(`landing.chapters.items.${key}.desc`)}
            </p>
            <Link
              to={`/features/${key}`}
              aria-label={`${t('landing.chapters.learn_more')}: ${t(`landing.chapters.items.${key}.title`)}`}
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/8 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
            >
              {t('landing.chapters.learn_more')}
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <FeatureVisual feature={key} />
        </article>
      ))}
    </div>
  );
}
