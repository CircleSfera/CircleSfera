import { describe, expect, it } from 'vitest';
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

  it('blocks saved tab for other users', () => {
    expect(profileTabFromParam('saved', false)).toBe('posts');
    expect(profileTabFromParam('saved', true)).toBe('saved');
  });
});
