import i18n, { type i18n as I18n, type LanguageDetectorModule } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { type AppLocale, toAppLocale } from './utils/appLocale';

type Catalog = { default: Record<string, unknown> };
export type CatalogLoaders = Record<AppLocale, () => Promise<Catalog>>;

// One catalog per language, downloaded when that language is used. Both
// together are the largest script of the app, and a person reads one.
const catalogs: CatalogLoaders = {
  en: () => import('./locales/en.json'),
  es: () => import('./locales/es.json'),
};

const otherLanguage = (language: AppLocale): AppLocale =>
  language === 'es' ? 'en' : 'es';

// Downloads the catalog of a language unless it is already in. A failed
// download leaves no trace, so the next call tries again.
export async function loadCatalog(
  instance: I18n,
  language: AppLocale,
  loaders: CatalogLoaders = catalogs,
) {
  if (instance.hasResourceBundle(language, 'translation')) return;
  const catalog = await loaders[language]();
  instance.addResourceBundle(language, 'translation', catalog.default);
}

// Changes the language of the app. The catalog is downloaded first: if that
// fails this rejects and the app stays in the language it was in.
export async function changeAppLanguage(
  language: string,
  instance: I18n = i18n,
  loaders: CatalogLoaders = catalogs,
) {
  const target = toAppLocale(language);
  await loadCatalog(instance, target, loaders);
  await instance.changeLanguage(target);
}

// Starts an instance with the app's language rules. The app uses the shared
// instance below with the browser's language; tests start their own and say
// which language the browser reports.
//
// Resolves once a catalog is in: the one of the detected language, tried
// twice, or else the other one, so the app can still be read. Rejects when
// neither could be downloaded.
export async function startI18n(
  instance: I18n,
  detector?: LanguageDetectorModule,
  loaders: CatalogLoaders = catalogs,
) {
  if (detector) instance.use(detector);
  else instance.use(LanguageDetector);
  await instance.use(initReactI18next).init({
    supportedLngs: ['en', 'es'],
    nonExplicitSupportedLngs: true,
    // `es-MX` reads the `es` catalog; no regional catalogs exist.
    load: 'languageOnly',
    // Every key exists in both languages, so a second catalog is never
    // needed: Spanish for any Spanish tag, English for everything else.
    fallbackLng: (code) => [toAppLocale(code)],
    interpolation: {
      escapeValue: false, // React already safes from xss
    },
    // Catalogs arrive after the instance has started.
    react: { useSuspense: false },
  });

  const detected = toAppLocale(instance.language);
  try {
    await loadCatalog(instance, detected, loaders).catch(() =>
      loadCatalog(instance, detected, loaders),
    );
  } catch {
    await changeAppLanguage(otherLanguage(detected), instance, loaders);
  }
}

// Resolves once a catalog is loaded; the app renders after it, so no text is
// ever shown as a key.
export const i18nReady = startI18n(i18n);

export default i18n;
