import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../services/auth.service';
import type { Profile } from '../types';
import { useAuthStore } from './authStore';

vi.mock('../services/auth.service', () => ({
  authApi: {
    logout: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

const assign = vi.fn();
const originalLocation = window.location;

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      profile: null,
      isAuthenticated: false,
    });
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('should have initial state', () => {
    const state = useAuthStore.getState();
    expect(state.profile).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('should set authenticated status', () => {
    useAuthStore.getState().setAuthenticated();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('should set profile', () => {
    const mockProfile = { id: '1', username: 'testuser' } as unknown as Profile;
    useAuthStore.getState().setProfile(mockProfile);

    expect(useAuthStore.getState().profile).toEqual(mockProfile);
  });

  it('should clear state on logout', async () => {
    useAuthStore.getState().setAuthenticated();
    const mockProfile = { id: '1', username: 'testuser' } as unknown as Profile;
    useAuthStore.getState().setProfile(mockProfile);

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.profile).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(authApi.logout).toHaveBeenCalledTimes(1);
  });

  // The query cache and the in-memory stores hold what the person who left
  // was shown: the app loads again so none of it reaches the next person.
  it('loads the app again at sign-in once the session is revoked', async () => {
    useAuthStore.getState().setAuthenticated();

    await useAuthStore.getState().logout();

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/accounts/login');
    expect(vi.mocked(authApi.logout).mock.invocationCallOrder[0]).toBeLessThan(
      assign.mock.invocationCallOrder[0],
    );
  });

  it('leaves a known notice for the sign-in page, and nothing else', async () => {
    await useAuthStore.getState().logout('deletion_scheduled');
    expect(assign).toHaveBeenLastCalledWith(
      '/accounts/login?notice=deletion_scheduled',
    );

    // A click handler given straight to an onClick passes its event.
    await useAuthStore.getState().logout(new MouseEvent('click') as never);
    expect(assign).toHaveBeenLastCalledWith('/accounts/login');
  });

  it('loads the app again even when the server cannot be told', async () => {
    vi.mocked(authApi.logout).mockRejectedValueOnce(new Error('offline'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await useAuthStore.getState().logout();

    expect(assign).toHaveBeenCalledWith('/accounts/login');
    consoleError.mockRestore();
  });
});
