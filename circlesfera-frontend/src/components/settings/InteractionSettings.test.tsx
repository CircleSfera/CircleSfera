import { fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usersApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import InteractionSettings from './InteractionSettings';

vi.mock('../../services', () => ({
  usersApi: { getSettings: vi.fn(), updateSettings: vi.fn() },
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});

const api = vi.mocked(usersApi);
const mentions = () =>
  screen.getByRole('combobox', { name: 'Who can mention you' });
const tags = () => screen.getByRole('combobox', { name: 'Who can tag you' });
const manual = () =>
  screen.getByRole('checkbox', { name: 'Approve tags manually' });
const requests = () =>
  screen.getByRole('checkbox', { name: 'Allow message requests' });

describe('InteractionSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.updateSettings.mockResolvedValue({} as never);
  });

  it("shows the Profile's saved choices", async () => {
    api.getSettings.mockResolvedValue({
      data: {
        mentionsFrom: 'FOLLOWING',
        tagsFrom: 'NOBODY',
        manualTagApproval: true,
        messageRequests: false,
      },
    } as never);
    renderWithProviders(<InteractionSettings />);

    await waitFor(() => expect(mentions()).toHaveValue('FOLLOWING'));
    expect(tags()).toHaveValue('NOBODY');
    expect(manual()).toBeChecked();
    expect(requests()).not.toBeChecked();
    expect(
      screen.getByRole('link', { name: 'Review your tags' }),
    ).toHaveAttribute('href', '/accounts/tags');
  });

  it('starts open to everyone, and saves only what changed', async () => {
    api.getSettings.mockResolvedValue({ data: {} } as never);
    renderWithProviders(<InteractionSettings />);

    await waitFor(() => expect(mentions()).not.toBeDisabled());
    expect(mentions()).toHaveValue('EVERYONE');
    expect(tags()).toHaveValue('EVERYONE');
    expect(manual()).not.toBeChecked();
    expect(requests()).toBeChecked();

    fireEvent.change(tags(), { target: { value: 'FOLLOWING' } });
    expect(api.updateSettings).toHaveBeenLastCalledWith({
      tagsFrom: 'FOLLOWING',
    });
    fireEvent.click(requests());
    expect(api.updateSettings).toHaveBeenLastCalledWith({
      messageRequests: false,
    });
    expect(requests()).not.toBeChecked();
  });

  it('puts the choice back and says so when it cannot be saved', async () => {
    api.getSettings.mockResolvedValue({ data: {} } as never);
    api.updateSettings.mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<InteractionSettings />);

    await waitFor(() => expect(manual()).not.toBeDisabled());
    fireEvent.click(manual());

    await waitFor(() => expect(manual()).not.toBeChecked());
    expect(toast.error).toHaveBeenCalledWith("Couldn't save the change");
  });
});
