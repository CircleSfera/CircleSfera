import { createContext } from 'react';
import type { Translations } from '../i18n/en';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

export type Language = 'en' | 'es';

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

export const translations = { en, es };

export const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);
