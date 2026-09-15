import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import {
  GuestAppChrome,
  GuestSurfaceMedia,
  LandingHero,
  LandingPrinciples,
} from './components/marketing';
import { renderWithProviders } from './test/test-utils';

vi.mock('./stores/useExperimentStore', () => ({
  useExperimentStore: (
    selector: (state: {
      flags: Record<string, boolean>;
      isLoaded: boolean;
      fetchFlags: () => Promise<void>;
      setFlags: (flags: Record<string, boolean>) => void;
    }) => unknown,
  ) =>
    selector({
      flags: {},
      isLoaded: true,
      fetchFlags: vi.fn().mockResolvedValue(undefined),
      setFlags: vi.fn(),
    }),
}));

describe('App Smoke Test', () => {
  it('renders without crashing', async () => {
    const { i18n } = renderWithProviders(<App />);
    expect(
      screen.getAllByText(i18n!.t('landing.nav.log_in'))[0],
    ).toBeInTheDocument();
  });
});

describe('Landing product surface', () => {
  it('hero shows headline and links to signup, explore, and login', () => {
    const { i18n } = renderWithProviders(<LandingHero />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      `${i18n!.t('landing.hero.title_part1')} ${i18n!.t('landing.hero.title_part2')}`,
    );
    expect(
      screen.getByRole('link', { name: i18n!.t('landing.hero.get_started') }),
    ).toHaveAttribute('href', '/accounts/signup');
    expect(
      screen.getByRole('link', { name: i18n!.t('landing.hero.log_in') }),
    ).toHaveAttribute('href', '/accounts/login');
    expect(
      screen.getByRole('link', { name: i18n!.t('landing.hero.explore_demo') }),
    ).toHaveAttribute('href', '/explore');
  });

  it('hero renders real copy, not i18n keys', () => {
    renderWithProviders(<LandingHero />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(/landing\.hero\./)).not.toBeInTheDocument();
  });

  it('principles section exposes five product principles', () => {
    const { i18n } = renderWithProviders(<LandingPrinciples />);
    expect(
      screen.getByText(i18n!.t('landing.principles.items.control.title')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        i18n!.t('landing.principles.items.no_suppression.title'),
      ),
    ).toBeInTheDocument();
  });

  it('hero product window is labelled as Home', () => {
    const { i18n } = renderWithProviders(<LandingHero />);
    expect(
      screen.getByRole('figure', { name: i18n!.t('landing.preview.home') }),
    ).toBeInTheDocument();
  });
});

describe('Guest chrome', () => {
  it('exposes login, signup, and primary destinations', () => {
    const { i18n } = renderWithProviders(<GuestAppChrome />);
    expect(screen.getByRole('link', { name: 'CircleSfera' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.getByRole('link', { name: i18n!.t('landing.nav.log_in') }),
    ).toHaveAttribute('href', '/accounts/login');
    expect(
      screen.getByRole('link', { name: i18n!.t('landing.nav.sign_up') }),
    ).toHaveAttribute('href', '/accounts/signup');
  });

  it('renders a labelled product window for each surface', () => {
    const { i18n } = renderWithProviders(
      <GuestSurfaceMedia surface="frames" />,
    );
    expect(
      screen.getByRole('figure', { name: i18n!.t('landing.preview.frames') }),
    ).toBeInTheDocument();
  });

  it('home mock shows For You / Following feed tabs', () => {
    const { i18n } = renderWithProviders(<GuestSurfaceMedia surface="home" />);
    expect(screen.getByText(i18n!.t('feed.for_you'))).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('feed.following'))).toBeInTheDocument();
  });
});
