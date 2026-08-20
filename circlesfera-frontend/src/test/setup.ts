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
        'landing.nav.primary': 'Primary',
        'landing.nav.open_menu': 'Open menu',
        'landing.nav.close_menu': 'Close menu',
        'landing.hero.badge': 'Social platform',
        'landing.hero.title_part1': 'Your feed,',
        'landing.hero.title_part2': 'your control',
        'landing.hero.subtitle':
          'Decide what you see, who you interact with, and what gets recommended. No silent suppression.',
        'landing.hero.get_started': 'Create account',
        'landing.hero.log_in': 'Log in',
        'landing.hero.already': 'Already have an account?',
        'landing.hero.explore_demo': 'Explore CircleSfera',
        'landing.preview.home': 'Home',
        'landing.preview.explore': 'Explore',
        'landing.preview.frames': 'Frames',
        'landing.preview.direct': 'Direct',
        'landing.preview.live': 'Live',
        'landing.preview.creator': 'Creator tools',
        'landing.preview.following': 'Following',
        'landing.chapters.learn_more': 'See how it works',
        'explore.for_you': 'For You',
        'landing.principles.badge': 'Principles',
        'landing.principles.title': 'Built for control you can explain',
        'landing.principles.subtitle': 'These are product rules, not slogans.',
        'landing.principles.items.control.title': 'User control first',
        'landing.principles.items.control.desc': 'You decide what you consume.',
        'landing.principles.items.transparency.title':
          'Algorithmic transparency',
        'landing.principles.items.transparency.desc':
          'Ranking stays explainable.',
        'landing.principles.items.no_suppression.title':
          'No hidden suppression',
        'landing.principles.items.no_suppression.desc':
          'Shadow bans are not a product tool.',
        'landing.principles.items.moderation.title':
          'Strict, explicit moderation',
        'landing.principles.items.moderation.desc':
          'Limits are explained and appealable.',
        'landing.principles.items.data.title': 'Responsible data handling',
        'landing.principles.items.data.desc':
          'Purpose limitation and minimization.',
        'landing.faq.badge': 'FAQ',
        'landing.faq.title': 'Straight answers',
        'landing.faq.subtitle': 'Only what ships today.',
        'landing.faq.items.free.q': 'Is CircleSfera free?',
        'landing.faq.items.free.a': 'Yes. Core social features are free.',
        'landing.faq.items.verify.q': 'How does identity verification work?',
        'landing.faq.items.verify.a': 'Via Stripe Identity from Settings.',
        'landing.faq.items.control.q': 'Do I control what I see?',
        'landing.faq.items.control.a': 'Yes. Preferences and appeals.',
        'landing.faq.items.mobile.q': 'Is there a mobile app?',
        'landing.faq.items.mobile.a':
          'CircleSfera is a mobile-first web app (PWA).',
        'landing.faq.items.plans.q': 'What do platform plans unlock?',
        'landing.faq.items.plans.a':
          'Premium, Elite Creator, and Business via Stripe.',
        'common.footer.explore': 'Explore',
        'common.footer.pricing': 'Pricing',
        'common.footer.support': 'Support',
        'landing.footer.features': 'Features',
        'landing.footer.principles': 'Principles',
        'landing.footer.product': 'Product',
        'landing.footer.platform': 'Platform',
        'landing.footer.legal': 'Legal',
        'landing.footer.account': 'Account',
        'landing.footer.desc': 'A social platform with explicit control.',
        'landing.footer.rights': '© 2026 CircleSfera. All rights reserved.',
        'landing.footer.tagline': 'One product. Every screen.',
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
