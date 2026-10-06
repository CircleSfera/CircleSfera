import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import ConnectStripeButton from './ConnectStripeButton';

vi.mock('../../services', () => ({ api: { post: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));

const originalLocation = window.location;
const location = { href: '/', origin: 'https://circlesfera.com' };

describe('ConnectStripeButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    location.href = '/';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('starts Stripe onboarding that returns to the monetization page', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { url: 'https://connect.stripe.com/setup/x' },
    });
    const { i18n } = renderWithProviders(<ConnectStripeButton />);

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('monetization.connect_with_stripe'),
      }),
    );

    await waitFor(() =>
      expect(location.href).toBe('https://connect.stripe.com/setup/x'),
    );
    expect(api.post).toHaveBeenCalledWith('/monetization/connect', {
      returnUrl:
        'https://circlesfera.com/creator/monetization?connect_success=true',
      refreshUrl: 'https://circlesfera.com/creator/monetization',
    });
  });

  it('stays put when the server returns no onboarding link', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const { i18n } = renderWithProviders(<ConnectStripeButton />);

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('monetization.connect_with_stripe'),
      }),
    );

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(location.href).toBe('/');
  });

  it('shows its own message, never the server text, when onboarding fails', async () => {
    vi.mocked(api.post).mockRejectedValue(
      Object.assign(new Error('Stripe says no'), {
        status: 400,
        data: { message: 'Stripe says no' },
      }),
    );
    const { i18n } = renderWithProviders(<ConnectStripeButton />);

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('monetization.connect_with_stripe'),
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('monetization.connect_stripe_error'),
      ),
    );
  });
});
