import i18n, {
  type BackendModule,
  type i18n as I18n,
  type LanguageDetectorModule,
} from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { toAppLocale } from './utils/appLocale';

// One catalog per language, downloaded when that language is used. Both
// together are the largest script of the app, and a person reads one.
const catalogs = {
  en: () => import('./locales/en.json'),
  es: () => import('./locales/es.json'),
};

const lazyCatalogs: BackendModule = {
  type: 'backend',
  init() {},
  read(language, _namespace, callback) {
    const load = catalogs[language as keyof typeof catalogs];
    if (!load) {
      callback(new Error(`No catalog for ${language}`), null);
      return;
    }
    load().then(
      (catalog) => callback(null, catalog.default),
      (error: Error) => callback(error, null),
    );
  },
};

// Starts an instance with the app's language rules. The app uses the shared
// instance below with the browser's language; tests start their own and say
// which language the browser reports.
export function startI18n(instance: I18n, detector?: LanguageDetectorModule) {
  instance.use(lazyCatalogs);
  if (detector) instance.use(detector);
  else instance.use(LanguageDetector);
  return instance.use(initReactI18next).init({
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
    // Switching language keeps the current text until the new catalog is in.
    react: { useSuspense: false },
  });
}

// Resolves once the catalog of the detected language is loaded; the app
// renders after it, so no text is ever shown as a key.
export const i18nReady = startI18n(i18n);

export default i18n;
