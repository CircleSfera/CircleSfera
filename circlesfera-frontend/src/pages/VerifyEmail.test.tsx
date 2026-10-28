import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, profileApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import { renderWithProviders } from '../test/test-utils';
import VerifyEmail from './VerifyEmail';

vi.mock('../services', () => ({
  authApi: { verifyEmail: vi.fn() },
  profileApi: { getMyProfile: vi.fn() },
}));
vi.mock('../layouts/LayoutWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function renderVerify() {
  return renderWithProviders(<VerifyEmail />, {
    routerProps: { initialEntries: ['/verify-email?token=abc'] },
  });
}

describe('VerifyEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.verifyEmail).mockResolvedValue({} as never);
  });

  it('reloads the profile of a signed-in account, so onboarding is offered', async () => {
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: { id: 'p1', username: 'ana', emailConfirmed: true },
    } as never);
    useAuthStore.setState({
      isAuthenticated: true,
      profile: { id: 'p1', username: 'ana', emailConfirmed: false } as never,
    });
    const { i18n } = renderVerify();

    expect(
      await screen.findByText(i18n!.t('auth.verify.success')),
    ).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledWith('abc');
    await waitFor(() =>
      expect(useAuthStore.getState().profile?.emailConfirmed).toBe(true),
    );
  });

  it('still says the email is verified when the profile cannot be reloaded', async () => {
    vi.mocked(profileApi.getMyProfile).mockRejectedValue(new Error('down'));
    useAuthStore.setState({ isAuthenticated: true, profile: null });
    const { i18n } = renderVerify();

    expect(
      await screen.findByText(i18n!.t('auth.verify.success')),
    ).toBeInTheDocument();
  });

  it('loads no profile for a visitor who is not signed in', async () => {
    useAuthStore.setState({ isAuthenticated: false, profile: null });
    const { i18n } = renderVerify();

    expect(
      await screen.findByText(i18n!.t('auth.verify.success')),
    ).toBeInTheDocument();
    expect(profileApi.getMyProfile).not.toHaveBeenCalled();
  });
});
