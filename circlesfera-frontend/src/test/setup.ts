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
        'landing.hero.badge': 'Feed · Frames · Direct · Live',
        'landing.hero.title_part1': 'Your feed.',
        'landing.hero.title_part2': 'You decide.',
        'landing.hero.subtitle':
          'Posts, stories, Frames, Direct, and Live. You choose what you see and who can reach you.',
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
        'landing.preview.feed': 'Home',
        'feed.foryou': 'For You',
        'feed.following': 'Following',
        'explore.trending': 'Trending',
        'landing.chapters.learn_more': 'See how it works',
        'explore.for_you': 'For You',
        'landing.principles.badge': 'Principles',
        'landing.principles.title': 'Control you can use.',
        'landing.principles.subtitle':
          'Five rules for what you see, who can reach you, and how your data is used.',
        'landing.principles.items.control.title': 'User control first',
        'landing.principles.items.control.desc': 'You decide what you consume.',
        'landing.principles.items.transparency.title': 'Why you see this',
        'landing.principles.items.transparency.desc':
          'What shows up should make sense.',
        'landing.principles.items.no_suppression.title':
          'Visibility you control',
        'landing.principles.items.no_suppression.desc':
          'Mute, hide, and feed preferences change what you see.',
        'landing.principles.items.moderation.title':
          'Strict, explicit moderation',
        'landing.principles.items.moderation.desc':
          'Community rules are public. You can appeal from Settings.',
        'landing.principles.items.data.title': 'Responsible data handling',
        'landing.principles.items.data.desc':
          'We keep what the product needs, and can say why.',
        'landing.faq.badge': 'FAQ',
        'landing.faq.title': 'Straight answers',
        'landing.faq.subtitle':
          'What CircleSfera is today — plans, the feed, and how to use it on your phone.',
        'landing.faq.items.free.q': 'Is CircleSfera free?',
        'landing.faq.items.free.a': 'Yes. Core social features are free.',
        'landing.faq.items.verify.q': 'How does identity verification work?',
        'landing.faq.items.verify.a': 'Via Stripe Identity from Settings.',
        'landing.faq.items.control.q': 'Do I control what I see?',
        'landing.faq.items.control.a': 'Yes. Preferences and appeals.',
        'landing.faq.items.mobile.q': 'Is there a mobile app?',
        'landing.faq.items.mobile.a':
          'CircleSfera works in the browser on your phone and on desktop.',
        'landing.faq.items.plans.q': 'What do platform plans unlock?',
        'landing.faq.items.plans.a':
          'Premium, Elite Creator, and Business via Stripe.',
        'landing.faq.items.support.q': 'Is there real technical support?',
        'landing.faq.items.support.a':
          'Yes. Log in, write from Support, and a person replies by email.',
        'common.footer.explore': 'Explore',
        'common.footer.pricing': 'Pricing',
        'common.footer.support': 'Support',
        'landing.footer.features': 'Features',
        'landing.footer.principles': 'Principles',
        'landing.footer.product': 'Product',
        'landing.footer.platform': 'Platform',
        'landing.footer.legal': 'Legal',
        'landing.footer.account': 'Account',
        'landing.footer.desc':
          'A social network for posts, Frames, Direct, Live, and creator tools.',
        'landing.footer.rights': '© 2026 CircleSfera. All rights reserved.',
        'landing.footer.tagline': 'One product. Every screen.',
        'post.content.likes': 'likes',
        'post.content.view_all_comments': 'View all {{count}} comments',
        'onboarding.continue': 'Continue',
        'onboarding.follow': 'Follow',
        'onboarding.following': 'Following',
        'onboarding.find_circle': 'Find your circle',
        'onboarding.enter': 'Enter CircleSfera',
        'onboarding.back': 'Back',
        'onboarding.step_profile': 'Profile',
        'onboarding.step_circle': 'Circle',
        'onboarding.empty_places_label': 'Where to find people',
        'onboarding.empty_message':
          'No creators to follow yet. Enter CircleSfera and find people from Home and Explore.',
        'onboarding.retry_suggestions': 'Refresh suggestions',
        'onboarding.find_circle_empty_subtitle':
          'No one to follow yet — you can skip this step.',
        'nav.home': 'Home',
        'nav.explore': 'Explore',
        'settings.hub.edit_profile': 'Edit',
        'settings.hub.plan_a11y': 'Subscription: {{plan}}',
        'settings.hub.privacy_a11y': 'Privacy: {{visibility}}',
        'settings.hub.public': 'Public',
        'settings.billing.free': 'Free',
        'settings.hub.nav_label': 'Account settings',
        'settings.hub.back': 'Back to account',
        'settings.notifications_tab.native_alerts': 'Native Alerts',
        'settings.notifications_tab.subscribe_success': 'Native alerts enabled',
        'settings.notifications_tab.subscribe_error':
          "Couldn't enable native alerts. Try again.",
        'settings.notifications_tab.unsubscribe_success':
          'Native alerts disabled',
        'settings.notifications_tab.unsubscribe_error':
          "Couldn't disable native alerts. Try again.",
        'settings.notifications_tab.enabling': 'Enabling native alerts…',
        'settings.notifications_tab.disabling': 'Disabling native alerts…',
        'settings.notifications_tab.not_registered': 'NOT REGISTERED',
        'settings.notifications_tab.enabled': 'ENABLED',
        'settings.notifications_tab.not_supported': 'NOT SUPPORTED',
        'settings.notifications_tab.status': 'Status',
        'settings.notifications_tab.pwa_support': 'PWA Support',
        'settings.notifications_tab.blocked':
          'Notifications are blocked in your browser settings.',
      };
      let val = translations[key] || key;
      if (options && typeof options === 'object') {
        if (options.count !== undefined) {
          val = val.replace('{{count}}', options.count.toString());
        }
        if (options.plan !== undefined) {
          val = val.replace('{{plan}}', String(options.plan));
        }
        if (options.visibility !== undefined) {
          val = val.replace('{{visibility}}', String(options.visibility));
        }
        if (options.defaultValue) {
          val = options.defaultValue;
        }
      } else if (typeof options === 'string') {
        // Prefer catalog entry when present; fallback string only if missing
        if (!translations[key]) {
          val = options;
        }
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
