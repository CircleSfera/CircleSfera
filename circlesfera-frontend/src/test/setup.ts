import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Automatically cleanup after each test
afterEach(() => {
  cleanup();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
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

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      const translations: Record<string, string> = {
        'auth.login.identifier_label': 'Email or Username',
        'auth.login.password_label': 'Password',
        'auth.login.sign_in': 'Sign In',
        'auth.login.title': 'Sign In',
        'landing.nav.log_in': 'Log In',
        'landing.nav.sign_up': 'Sign Up',
        'post.content.likes': 'likes',
        'post.content.view_all_comments': 'View all {{count}} comments',
      };
      let val = translations[key] || key;
      if (options && typeof options === 'object') {
        if (options.count !== undefined) {
          val = val.replace('{{count}}', options.count.toString());
        }
        if (options.defaultValue) {
          val = options.defaultValue;
        }
      } else if (typeof options === 'string') {
        val = options;
      }
      return val;
    },
    i18n: {
      changeLanguage: () => Promise.resolve(),
      language: 'en',
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
}));
