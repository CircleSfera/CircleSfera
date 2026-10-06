import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { profileApi } from '../services/profile.service';
import { useAuthStore } from './authStore';

vi.mock('../services/profile.service', () => ({
  profileApi: { switchProfile: vi.fn(), getMyProfile: vi.fn() },
}));

describe('authStore.switchProfile', () => {
  const deleteCache = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('caches', { delete: deleteCache });
    deleteCache.mockResolvedValue(true);
    vi.mocked(profileApi.switchProfile).mockResolvedValue({} as never);
    useAuthStore.setState({
      profile: { id: 'p-old', username: 'old' } as never,
      isAuthenticated: true,
      isCreatorModeActive: true,
      isSessionChecked: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears the cached API responses before the session changes Profile', async () => {
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: { id: 'p-new', username: 'new' },
    } as never);

    await useAuthStore.getState().switchProfile?.('p-new');

    expect(deleteCache).toHaveBeenCalledWith('api-cache');
    expect(deleteCache.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(profileApi.switchProfile).mock.invocationCallOrder[0],
    );
    expect(useAuthStore.getState()).toMatchObject({
      profile: { id: 'p-new' },
      isCreatorModeActive: false,
    });
  });

  it('does not switch when the cache cannot be cleared', async () => {
    deleteCache.mockRejectedValue(new Error('blocked'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      useAuthStore.getState().switchProfile?.('p-new'),
    ).rejects.toThrow();

    expect(profileApi.switchProfile).not.toHaveBeenCalled();
    expect(useAuthStore.getState().profile).toMatchObject({ id: 'p-old' });
  });

  it('a failed refresh after the switch still counts as switched', async () => {
    vi.mocked(profileApi.getMyProfile).mockRejectedValue(new Error('down'));

    await expect(
      useAuthStore.getState().switchProfile?.('p-new'),
    ).resolves.toBeUndefined();

    // The reload that follows loads the new Profile again.
    expect(useAuthStore.getState().isSessionChecked).toBe(false);
  });
});
