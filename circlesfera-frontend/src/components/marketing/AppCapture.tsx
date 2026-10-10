import { useTranslation } from 'react-i18next';

/**
 * A picture of a real screen of the app, with example content. The pictures
 * are taken from the running app by `e2e/marketing-captures.spec.ts`, in
 * both languages, so what the public pages show is the product itself.
 */
export const CAPTURED_SCREENS = [
  'home',
  'story',
  'frames',
  'chat',
  'live',
  'creator',
  'explore',
] as const;

export type CapturedScreen = (typeof CAPTURED_SCREENS)[number];

const PICTURES = import.meta.glob<string>('../../assets/marketing/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function captureUrl(screen: CapturedScreen, language: string): string {
  const lang = language.startsWith('es') ? 'es' : 'en';
  return PICTURES[`../../assets/marketing/${screen}-${lang}.jpg`] ?? '';
}

export function AppCapture({
  screen,
  eager = false,
}: {
  screen: CapturedScreen;
  /** Load at once: for the picture at the top of a page. */
  eager?: boolean;
}) {
  const { i18n } = useTranslation();

  return (
    <img
      src={captureUrl(screen, i18n.language)}
      alt=""
      width={390}
      height={800}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className="block h-auto w-full"
    />
  );
}
