import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../services/auth.service';
import { profileApi } from '../services/profile.service';
import { useAuthStore } from './authStore';

vi.mock('../services/profile.service', () => ({
  profileApi: { getMyProfile: vi.fn(), switchProfile: vi.fn() },
}));
vi.mock('../services/auth.service', () => ({
  authApi: { logout: vi.fn() },
}));

const reset = (state: Partial<ReturnType<typeof useAuthStore.getState>>) =>
  useAuthStore.setState({
    profile: null,
    isAuthenticated: false,
    isCreatorModeActive: false,
    isSessionChecked: false,
    isCheckingSession: false,
    ...state,
  });

describe('authStore session check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset({});
  });

  it('does not call the server when nothing was remembered', async () => {
    await useAuthStore.getState().checkSession();

    expect(profileApi.getMyProfile).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isSessionChecked).toBe(true);
  });

  it('refreshes a remembered session with the current profile', async () => {
    reset({ isAuthenticated: true, profile: { id: 'old' } as never });
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: { id: 'p1' },
    } as never);

    await useAuthStore.getState().checkSession();

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      isSessionChecked: true,
      isCheckingSession: false,
      profile: { id: 'p1' },
    });
  });

  it('checks once even when asked several times at once', async () => {
    reset({ isAuthenticated: true });
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: { id: 'p1' },
    } as never);

    await Promise.all([
      useAuthStore.getState().checkSession(),
      useAuthStore.getState().checkSession(),
    ]);
    await useAuthStore.getState().checkSession();

    expect(profileApi.getMyProfile).toHaveBeenCalledTimes(1);
  });

  it('forgets a session the server rejects', async () => {
    reset({ isAuthenticated: true, profile: { id: 'p1' } as never });
    vi.mocked(profileApi.getMyProfile).mockRejectedValue(new Error('401'));

    await useAuthStore.getState().checkSession();

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      profile: null,
      isSessionChecked: true,
    });
  });

  it('signs out locally even when the server cannot be reached', async () => {
    reset({
      isAuthenticated: true,
      isCreatorModeActive: true,
      profile: { id: 'p1' } as never,
    });
    vi.mocked(authApi.logout).mockRejectedValue(new Error('offline'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      isCreatorModeActive: false,
      profile: null,
    });
    consoleError.mockRestore();
  });

  it('signs out when any request reports the session ended', async () => {
    reset({ isAuthenticated: true, profile: { id: 'p1' } as never });
    vi.mocked(authApi.logout).mockResolvedValue({} as never);

    window.dispatchEvent(new Event('auth:unauthorized'));

    await vi.waitFor(() =>
      expect(useAuthStore.getState().isAuthenticated).toBe(false),
    );
    expect(authApi.logout).toHaveBeenCalled();
  });
});
