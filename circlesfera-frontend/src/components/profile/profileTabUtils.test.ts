import { describe, expect, it, vi } from 'vitest';
import { profileTabFromParam } from './profileTabUtils';

describe('profileTabFromParam', () => {
  it('defaults to posts', () => {
    expect(profileTabFromParam(null, true)).toBe('posts');
    expect(profileTabFromParam('invalid', false)).toBe('posts');
  });

  it('returns requested tab when valid', () => {
    expect(profileTabFromParam('frames', true)).toBe('frames');
    expect(profileTabFromParam('tagged', false)).toBe('tagged');
  });

  it('opens the posts for a link to the Lives tab where the build does not show it', async () => {
    vi.stubEnv('VITE_LIVE_RECORDING_ENABLED', 'false');
    vi.resetModules();
    const utils = await import('./profileTabUtils');
    expect(utils.profileTabFromParam('lives', true)).toBe('posts');
    expect(utils.profileTabFromParam('lives', false)).toBe('posts');
    vi.unstubAllEnvs();
  });

  it('opens the Lives tab from a link where the build shows it', async () => {
    vi.stubEnv('VITE_LIVE_RECORDING_ENABLED', 'true');
    vi.resetModules();
    const utils = await import('./profileTabUtils');
    expect(utils.profileTabFromParam('lives', false)).toBe('lives');
    vi.unstubAllEnvs();
  });

  it('blocks saved tab for other users', () => {
    expect(profileTabFromParam('saved', false)).toBe('posts');
    expect(profileTabFromParam('saved', true)).toBe('saved');
  });
});
