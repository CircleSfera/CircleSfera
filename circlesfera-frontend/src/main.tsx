import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import { initSentry } from './sentry.ts';
import './i18n';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  </StrictMode>,
);
