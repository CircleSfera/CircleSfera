import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { profileApi, usersApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import PrivacySettings from './PrivacySettings';

vi.mock('../../services', () => ({
  profileApi: { getMyProfile: vi.fn(), updateProfile: vi.fn() },
  usersApi: { getSettings: vi.fn(), updateSettings: vi.fn() },
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
    vi.mocked(usersApi.getSettings).mockResolvedValue({
      data: { allowStoryShares: true },
    } as never);
    vi.mocked(usersApi.updateSettings).mockResolvedValue({} as never);
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

  it('reads the choice of this profile, and says what going public does', async () => {
    await show({ username: 'ana', isPrivate: true });

    await waitFor(() => expect(lock()).toBeChecked());
    expect(
      screen.getByText(
        /Your other profiles keep their own choice\. If you make it public, the follow requests that are waiting are accepted\./,
      ),
    ).toBeInTheDocument();
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
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => logged.mockRestore());
    api.updateProfile.mockRejectedValue(new Error('down'));
    await show({ username: 'ana', isPrivate: false });

    fireEvent.click(lock());

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalled());
    await waitFor(() => expect(lock()).not.toBeChecked());
    expect(logged).toHaveBeenCalledWith('Failed to update privacy settings');
  });

  it('points to where the data export is', async () => {
    await show({ username: 'ana', isPrivate: false });

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/accounts/account',
    );
  });

  describe('sharing to stories', () => {
    const shares = () =>
      screen.getByRole('checkbox', { name: 'Allow sharing to stories' });

    it('is on unless the Profile turned it off, and turns off', async () => {
      await show({ username: 'ana', isPrivate: false });
      await waitFor(() => expect(shares()).toBeEnabled());
      expect(shares()).toBeChecked();

      fireEvent.click(shares());

      expect(usersApi.updateSettings).toHaveBeenCalledWith({
        allowStoryShares: false,
      });
      expect(shares()).not.toBeChecked();
    });

    it('shows it off when the Profile turned it off', async () => {
      vi.mocked(usersApi.getSettings).mockResolvedValue({
        data: { allowStoryShares: false },
      } as never);
      await show({ username: 'ana', isPrivate: false });

      await waitFor(() => expect(shares()).not.toBeChecked());
    });

    it('shows it on when the settings cannot be read', async () => {
      vi.mocked(usersApi.getSettings).mockRejectedValue(new Error('down'));
      await show({ username: 'ana', isPrivate: false });

      await waitFor(() => expect(shares()).toBeEnabled());
      expect(shares()).toBeChecked();
    });

    it('changes nothing when the settings arrive after it was closed', async () => {
      let answer: (value: unknown) => void = () => {};
      vi.mocked(usersApi.getSettings).mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }) as never,
      );
      let fail: (reason: unknown) => void = () => {};
      const view = await show({ username: 'ana', isPrivate: false });
      view.unmount();
      answer({ data: { allowStoryShares: false } });

      vi.mocked(usersApi.getSettings).mockReturnValue(
        new Promise((_, reject) => {
          fail = reject;
        }) as never,
      );
      const again = await show({ username: 'ana', isPrivate: false });
      again.unmount();
      fail(new Error('down'));
      await Promise.resolve();
    });

    it('goes back when the change is refused', async () => {
      vi.mocked(usersApi.updateSettings).mockRejectedValue(new Error('down'));
      await show({ username: 'ana', isPrivate: false });
      await waitFor(() => expect(shares()).toBeEnabled());

      fireEvent.click(shares());

      await waitFor(() => expect(shares()).toBeChecked());
    });
  });
});
