import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usersApi } from '../../services/users.service';
import { renderWithProviders } from '../../test/test-utils';
import CountrySetting from './CountrySetting';

vi.mock('../../services/users.service', () => ({
  usersApi: { getSettings: vi.fn(), updateSettings: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('CountrySetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersApi.getSettings).mockResolvedValue({
      data: { country: 'PT' },
    } as never);
    vi.mocked(usersApi.updateSettings).mockResolvedValue({} as never);
  });

  it('shows the country chosen, by its name', async () => {
    renderWithProviders(<CountrySetting />);
    const select = screen.getByLabelText('Country');
    await waitFor(() => expect(select).toHaveValue('PT'));
    expect(
      screen.getByRole('option', { name: 'Portugal', selected: true }),
    ).toBeInTheDocument();
  });

  it('saves a country, and goes back to the network one with none', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CountrySetting />);
    const select = screen.getByLabelText('Country');
    await waitFor(() => expect(select).toHaveValue('PT'));

    await user.selectOptions(select, 'ES');
    await waitFor(() =>
      expect(usersApi.updateSettings).toHaveBeenCalledWith({ country: 'ES' }),
    );
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, '');
    await waitFor(() =>
      expect(usersApi.updateSettings).toHaveBeenLastCalledWith({
        country: null,
      }),
    );
  });

  it('puts the country back and says so when it could not be saved', async () => {
    vi.mocked(usersApi.updateSettings).mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    renderWithProviders(<CountrySetting />);
    const select = screen.getByLabelText('Country');
    await waitFor(() => expect(select).toHaveValue('PT'));

    await user.selectOptions(select, 'ES');

    await waitFor(() => expect(select).toHaveValue('PT'));
    expect(toast.error).toHaveBeenCalledWith(
      'The country could not be saved. Try again.',
    );
  });
});
