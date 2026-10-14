import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initSentry } from '../sentry';
import { renderWithProviders } from '../test/test-utils';
import { getCookieConsent, persistCookieConsent } from '../utils/cookieConsent';
import CookieConsent from './CookieConsent';

vi.mock('../sentry', () => ({ initSentry: vi.fn() }));

const banner = () => screen.queryByRole('dialog', { name: 'Cookies' });
const show = () => renderWithProviders(<CookieConsent />);

describe('CookieConsent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('asks a person who has not answered yet', async () => {
    show();

    await waitFor(() => expect(banner()).toBeInTheDocument());
    // Nothing is measured before the answer.
    expect(initSentry).not.toHaveBeenCalled();
    expect(getCookieConsent()).toBeNull();
  });

  it.each([true, false])(
    'does not ask again a person who answered (analytics %s), and starts nothing by itself',
    (analytics) => {
      persistCookieConsent(analytics);
      show();

      expect(banner()).not.toBeInTheDocument();
      expect(initSentry).not.toHaveBeenCalled();
    },
  );

  it('starts error reporting only when everything is accepted', async () => {
    show();
    await waitFor(() => expect(banner()).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));

    expect(getCookieConsent()).toMatchObject({ analytics: true });
    expect(initSentry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(banner()).not.toBeInTheDocument());
  });

  it.each(['Essential only', 'Dismiss'])(
    'keeps only the necessary cookies with "%s", and reports nothing',
    async (name) => {
      show();
      await waitFor(() => expect(banner()).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name }));

      expect(getCookieConsent()).toMatchObject({ analytics: false });
      expect(initSentry).not.toHaveBeenCalled();
      await waitFor(() => expect(banner()).not.toBeInTheDocument());
    },
  );
});
