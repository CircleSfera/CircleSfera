import i18next, { type LanguageDetectorModule } from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { type CatalogLoaders, changeAppLanguage, startI18n } from './i18n';

// What the browser would report as its language.
const browserLanguage = (language: string): LanguageDetectorModule => ({
  type: 'languageDetector',
  init() {},
  detect: () => language,
  cacheUserLanguage() {},
});

async function startApp(language: string, loaders?: CatalogLoaders) {
  const instance = i18next.createInstance();
  await startI18n(instance, browserLanguage(language), loaders);
  return instance;
}

const catalog = (decline: string) => () =>
  Promise.resolve({ default: { chat: { decline } } });
const down = () => Promise.reject(new Error('chunk failed to load'));

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

    await changeAppLanguage('es', i18n);

    expect(i18n.hasResourceBundle('es', 'translation')).toBe(true);
    expect(i18n.t('chat.decline')).toBe('Rechazar');
  });
});

describe('translations when a download fails', () => {
  it('tries the catalog of the detected language a second time', async () => {
    const es = vi
      .fn<CatalogLoaders['es']>()
      .mockRejectedValueOnce(new Error('chunk failed to load'))
      .mockImplementation(catalog('Rechazar'));
    const en = vi.fn(catalog('Decline'));

    const i18n = await startApp('es', { en, es });

    expect(es).toHaveBeenCalledTimes(2);
    expect(en).not.toHaveBeenCalled();
    expect(i18n.language).toBe('es');
    expect(i18n.t('chat.decline')).toBe('Rechazar');
  });

  it('starts in the other language when the detected one cannot be downloaded', async () => {
    const i18n = await startApp('es', { en: catalog('Decline'), es: down });

    expect(i18n.language).toBe('en');
    expect(i18n.t('chat.decline')).toBe('Decline');
  });

  it('does not start when no catalog can be downloaded', async () => {
    await expect(startApp('es', { en: down, es: down })).rejects.toThrow();
  });

  it('stays in the current language, with its text, when the switch cannot be downloaded', async () => {
    const loaders = { en: catalog('Decline'), es: down };
    const i18n = await startApp('en', loaders);

    await expect(changeAppLanguage('es', i18n, loaders)).rejects.toThrow();

    expect(i18n.language).toBe('en');
    expect(i18n.t('chat.decline')).toBe('Decline');
  });

  it('switches on a later attempt once the download works', async () => {
    const es = vi
      .fn<CatalogLoaders['es']>()
      .mockRejectedValueOnce(new Error('chunk failed to load'))
      .mockImplementation(catalog('Rechazar'));
    const loaders = { en: catalog('Decline'), es };
    const i18n = await startApp('en', loaders);

    await expect(changeAppLanguage('es', i18n, loaders)).rejects.toThrow();
    await changeAppLanguage('es', i18n, loaders);

    expect(i18n.language).toBe('es');
    expect(i18n.t('chat.decline')).toBe('Rechazar');
  });
});
