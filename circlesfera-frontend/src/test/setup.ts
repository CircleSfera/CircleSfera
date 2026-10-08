import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import i18n, { i18nReady, loadCatalog } from '../i18n';

vi.mock('i18next-browser-languagedetector', () => ({
  default: {
    type: 'languageDetector',
    async: false,
    init() {},
    detect: () => 'en',
    cacheUserLanguage() {},
  },
}));

// Tests read both catalogs at once, as the app did before it loaded one
// per language.
await i18nReady;
await Promise.all([loadCatalog(i18n, 'en'), loadCatalog(i18n, 'es')]);

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  if (i18n.language !== 'en') {
    await i18n.changeLanguage('en');
  }
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class IntersectionObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock,
});

window.scrollTo = vi.fn();
Element.prototype.scrollTo = vi.fn();
