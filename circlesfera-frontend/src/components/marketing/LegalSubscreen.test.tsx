import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import TermsOfService from '../../pages/TermsOfService';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import { LEGAL_BACK_FALLBACK } from './LegalSubscreen';

function renderTerms(entries: (string | { pathname: string; key: string })[]) {
  return renderWithProviders(
    <Routes>
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/privacy" element={<p>privacy page</p>} />
      <Route path="/settings-page" element={<p>where I was</p>} />
      <Route path={LEGAL_BACK_FALLBACK} element={<p>start</p>} />
    </Routes>,
    {
      routerProps: {
        initialEntries: entries as string[],
        initialIndex: entries.length - 1,
      },
    },
  );
}

describe('a legal page', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true });
  });

  it('signed in, is a screen with a bar that names it, and chips to the others', () => {
    renderTerms(['/terms']);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms of Service' }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Legal' });
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent(
      'Terms',
    );
    fireEvent.click(screen.getByRole('link', { name: 'Privacy' }));
    expect(screen.getByText('privacy page')).toBeInTheDocument();
  });

  it('goes back to where the person came from', () => {
    renderTerms(['/settings-page', '/terms']);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('where I was')).toBeInTheDocument();
  });

  it('opened on its own, goes back to the start of the app', () => {
    renderTerms(['/terms']);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('start')).toBeInTheDocument();
  });

  it('signed out, is the public page, with no back bar', () => {
    useAuthStore.setState({ isAuthenticated: false });
    renderTerms(['/terms']);
    expect(
      screen.queryByRole('button', { name: 'Back' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Legal' }),
    ).toBeInTheDocument();
  });
});
