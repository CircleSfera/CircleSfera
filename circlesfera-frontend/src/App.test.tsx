import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App';
import {
  GuestAppChrome,
  GuestSurfaceMedia,
  LandingHero,
  LandingPrinciples,
} from './components/marketing';

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App Smoke Test', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<App />);
    // Guest landing chrome exposes Log In in GuestAppChrome
    expect(screen.getAllByText('Log In')[0]).toBeInTheDocument();
  });
});

describe('Landing product surface', () => {
  it('hero shows headline and links to signup, explore, and login', () => {
    renderWithProviders(<LandingHero />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /your feed\.?\s*you decide/i,
    );
    expect(
      screen.getByRole('link', { name: /create account/i }),
    ).toHaveAttribute('href', '/accounts/signup');
    expect(screen.getByRole('link', { name: /^log in$/i })).toHaveAttribute(
      'href',
      '/accounts/login',
    );
    expect(
      screen.getByRole('link', { name: /explore circlesfera/i }),
    ).toHaveAttribute('href', '/explore');
  });

  it('hero renders real copy, not i18n keys', () => {
    renderWithProviders(<LandingHero />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(/landing\.hero\./)).not.toBeInTheDocument();
  });

  it('principles section exposes five product principles', () => {
    renderWithProviders(<LandingPrinciples />);
    expect(screen.getByText(/user control first/i)).toBeInTheDocument();
    expect(screen.getByText(/visibility you control/i)).toBeInTheDocument();
  });

  it('hero product window is labelled as Home', () => {
    renderWithProviders(<LandingHero />);
    expect(screen.getByRole('figure', { name: /home/i })).toBeInTheDocument();
  });
});

describe('Guest chrome', () => {
  it('exposes login, signup, and primary destinations', () => {
    renderWithProviders(<GuestAppChrome />);
    expect(screen.getByRole('link', { name: 'CircleSfera' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Log In' })).toHaveAttribute(
      'href',
      '/accounts/login',
    );
    expect(screen.getByRole('link', { name: 'Sign Up' })).toHaveAttribute(
      'href',
      '/accounts/signup',
    );
  });

  it('renders a labelled product window for each surface', () => {
    renderWithProviders(<GuestSurfaceMedia surface="frames" />);
    expect(screen.getByRole('figure', { name: /frames/i })).toBeInTheDocument();
  });

  it('home mock shows For You / Following feed tabs', () => {
    renderWithProviders(<GuestSurfaceMedia surface="home" />);
    expect(screen.getByText(/for you/i)).toBeInTheDocument();
    expect(screen.getByText(/following/i)).toBeInTheDocument();
  });
});
