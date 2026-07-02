import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../types';
import { useAuthStore } from './authStore';

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      profile: null,
      isAuthenticated: false,
    });
    vi.clearAllMocks();
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
  });
});
