import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, startTransition } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import { AppToaster } from './components/ui/AppToaster';
import { i18nReady } from './i18n';
import { initSentry } from './sentry.ts';
import './index.css';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';

initSentry();

// Prevent pinch-zoom on mobile devices except for images and videos
document.addEventListener(
  'touchmove',
  (e: TouchEvent) => {
    if (e.touches.length > 1) {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'IMG' && target.tagName !== 'VIDEO') {
        e.preventDefault();
      }
    }
  },
  { passive: false },
);

document.addEventListener('gesturestart', (e: Event) => {
  const target = e.target as HTMLElement;
  if (target.tagName !== 'IMG' && target.tagName !== 'VIDEO') {
    e.preventDefault();
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// The first screen waits for the catalog of the person's language.
const root = createRoot(document.getElementById('root')!);
const renderApp = () =>
  // As a transition, React builds the first screen in short slices instead of
  // one long task, so the page keeps answering while it starts.
  startTransition(() =>
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <HelmetProvider>
            <QueryClientProvider client={queryClient}>
              <BrowserRouter useTransitions={false}>
                <App />
                <AppToaster />
              </BrowserRouter>
            </QueryClientProvider>
          </HelmetProvider>
        </ErrorBoundary>
      </StrictMode>,
    ),
  );

// No catalog could be downloaded, so there is no text to show the app with.
// This screen cannot be translated either: it says the same in both languages.
const renderStartupError = () =>
  root.render(
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 px-4 text-center bg-surface-base text-white">
      <div className="space-y-2 max-w-sm">
        <p className="text-base font-semibold">
          CircleSfera could not load. Check your connection and try again.
        </p>
        <p className="text-base text-white/70" lang="es">
          CircleSfera no se pudo cargar. Comprueba tu conexión e inténtalo de
          nuevo.
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-12 px-6 rounded-full bg-brand-primary text-white text-sm font-bold"
      >
        Try again · Reintentar
      </button>
    </main>,
  );

i18nReady.then(renderApp, renderStartupError);

// Register Service Worker for PWA & Push Notifications auto-initiation
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => {
        console.log(
          'Service Worker registered successfully with scope:',
          reg.scope,
        );
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });
  });
}
