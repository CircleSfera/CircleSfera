import i18next, { type LanguageDetectorModule } from 'i18next';
import { describe, expect, it } from 'vitest';
import { startI18n } from './i18n';

// What the browser would report as its language.
const browserLanguage = (language: string): LanguageDetectorModule => ({
  type: 'languageDetector',
  init() {},
  detect: () => language,
  cacheUserLanguage() {},
});

async function startApp(language: string) {
  const instance = i18next.createInstance();
  await startI18n(instance, browserLanguage(language));
  return instance;
}

describe('translations at startup', () => {
  it('loads only the catalog of the detected language', async () => {
    const i18n = await startApp('en');

    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('es', 'translation')).toBe(false);
    expect(i18n.t('auth.login.sign_in')).not.toBe('auth.login.sign_in');
  });

  it('reads the Spanish catalog for any Spanish region, without the English one', async () => {
    const i18n = await startApp('es-MX');

    expect(i18n.hasResourceBundle('es', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(false);
    expect(i18n.t('chat.decline')).toBe('Rechazar');
  });

  it('shows English to a language the app does not have', async () => {
    const i18n = await startApp('fr-FR');

    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('es', 'translation')).toBe(false);
    expect(i18n.t('chat.decline')).toBe('Decline');
  });

  it('downloads the other catalog when the language is changed', async () => {
    const i18n = await startApp('en');

    await i18n.changeLanguage('es');

    expect(i18n.hasResourceBundle('es', 'translation')).toBe(true);
    expect(i18n.t('chat.decline')).toBe('Rechazar');
  });
});
