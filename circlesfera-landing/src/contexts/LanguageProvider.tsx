import React, { useState, useEffect } from 'react';
import { LanguageContext, translations } from './LanguageContext';
import type { Language } from './LanguageContext';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('circlesfera_lang');
    if (saved === 'en' || saved === 'es') return (saved as Language);
    
    // Default to English (removed auto-detection)
    return 'en';
  });

  useEffect(() => {
    localStorage.setItem('circlesfera_lang', language);
    document.documentElement.lang = language;
  }, [language]);

  const value = {
    language,
    setLanguage,
    t: translations[language],
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
