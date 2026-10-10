import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { profileApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import PrivacySettings from './PrivacySettings';

vi.mock('../../services', () => ({
  profileApi: { getMyProfile: vi.fn(), updateProfile: vi.fn() },
}));

const api = vi.mocked(profileApi);
const lock = () => screen.getByRole('checkbox', { name: 'Private account' });
const show = async (profile: object) => {
  api.getMyProfile.mockResolvedValue({ data: profile } as never);
  const view = renderWithProviders(<PrivacySettings />);
  // The switch follows the profile once it has arrived.
  await waitFor(() =>
    expect(view.queryClient.getQueryData(['myProfile'])).toBeDefined(),
  );
  return view;
};

describe('PrivacySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The server keeps what was saved: asked again, it answers it.
    api.updateProfile.mockImplementation(((data: { isPrivate: boolean }) => {
      const saved = { username: 'ana', isPrivate: data.isPrivate };
      api.getMyProfile.mockResolvedValue({ data: saved } as never);
      return Promise.resolve({ data: saved });
    }) as never);
  });

  it('shows a public account as not private', async () => {
    await show({ username: 'ana', isPrivate: false });

    expect(lock()).not.toBeChecked();
  });

  it('shows a private account as private', async () => {
    await show({ username: 'ana', isPrivate: true });

    await waitFor(() => expect(lock()).toBeChecked());
  });

  it('reads the privacy from the settings of the account when the profile does not say', async () => {
    await show({
      username: 'ana',
      user: { settings: { privacyLevel: 'PRIVATE' } },
    });

    await waitFor(() => expect(lock()).toBeChecked());
  });

  it('makes the account private and keeps it so', async () => {
    await show({ username: 'ana', isPrivate: false });

    fireEvent.click(lock());

    expect(lock()).toBeChecked();
    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith({ isPrivate: true }),
    );
    await waitFor(() => expect(lock()).toBeChecked());
  });

  it('makes the account public again', async () => {
    await show({ username: 'ana', isPrivate: true });
    await waitFor(() => expect(lock()).toBeChecked());

    fireEvent.click(lock());

    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith({ isPrivate: false }),
    );
    await waitFor(() => expect(lock()).not.toBeChecked());
  });

  it('goes back to what it was when the change is refused', async () => {
    api.updateProfile.mockRejectedValue(new Error('down'));
    await show({ username: 'ana', isPrivate: false });

    fireEvent.click(lock());

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalled());
    await waitFor(() => expect(lock()).not.toBeChecked());
  });

  it('points to where the data export is', async () => {
    await show({ username: 'ana', isPrivate: false });

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/accounts/account',
    );
  });
});
