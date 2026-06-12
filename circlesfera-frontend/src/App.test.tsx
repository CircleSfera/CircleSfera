import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App Smoke Test', () => {
  it('renders without crashing', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    // Expect some basic element to be present, e.g., from the landing page or login
    // Since App likely defaults to LandingPage or Login redirection
    // matches "Log In" link which is in the Landing Page nav
    const loginLink = await screen.findByRole('link', { name: /Log In/i });
    expect(loginLink).toBeDefined();
  });
});
