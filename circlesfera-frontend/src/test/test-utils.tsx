import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RenderOptions, render } from '@testing-library/react';
import i18n, { type i18n as I18nInstance } from 'i18next';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';
import enTranslation from '../locales/en.json';
import esTranslation from '../locales/es.json';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/** Isolated catalog. Default `en` matches setup.ts; pass `es` for composer. */
export function createTestI18n(lng: 'es' | 'en' = 'en'): I18nInstance {
  const instance = i18n.createInstance();
  instance.use(initReactI18next);
  void instance.init({
    lng,
    resources: {
      es: { translation: esTranslation },
      en: { translation: enTranslation },
    },
    supportedLngs: ['en', 'es'],
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  return instance;
}

type ProviderOptions = {
  routerProps?: MemoryRouterProps;
  queryClient?: QueryClient;
  /** Override the setup.ts i18n instance. `false` skips I18nextProvider (uses global `en`). */
  i18n?: I18nInstance | false;
  lng?: 'es' | 'en';
};

export function renderWithProviders(
  ui: ReactElement,
  {
    routerProps = { useTransitions: false },
    queryClient = createTestQueryClient(),
    i18n: i18nOption,
    lng = 'en',
    ...options
  }: RenderOptions & ProviderOptions = {},
) {
  const i18nInstance =
    i18nOption === false ? null : (i18nOption ?? createTestI18n(lng));

  function Wrapper({ children }: { children: ReactNode }) {
    const tree = (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter {...routerProps}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
    if (!i18nInstance) return tree;
    return <I18nextProvider i18n={i18nInstance}>{tree}</I18nextProvider>;
  }

  return {
    queryClient,
    i18n: i18nInstance,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}
