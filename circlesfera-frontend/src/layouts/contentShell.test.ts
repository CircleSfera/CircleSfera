import { describe, expect, it } from 'vitest';
import {
  getContentShell,
  hidesBottomNav,
  hidesTopNav,
  isImmersiveShell,
  isViewportLockedShell,
} from './contentShell';

describe('getContentShell', () => {
  it('maps create and edits to create shell', () => {
    expect(getContentShell('/create')).toBe('create');
    expect(getContentShell('/create?mode=story')).toBe('create');
    expect(getContentShell('/edits')).toBe('create');
  });

  it('maps live broadcast to broadcast and viewer to playback', () => {
    expect(getContentShell('/live/broadcast')).toBe('broadcast');
    expect(getContentShell('/live/abc-123')).toBe('playback');
  });

  it('maps frames to vertical, explore map to map, and feed to stream', () => {
    expect(getContentShell('/frames')).toBe('vertical');
    expect(getContentShell('/explore/map')).toBe('map');
    expect(getContentShell('/')).toBe('stream');
    expect(getContentShell('/alice')).toBe('stream');
  });
});

describe('shell chrome helpers', () => {
  it('treats create, broadcast, playback, map as immersive', () => {
    expect(isImmersiveShell('create')).toBe(true);
    expect(isImmersiveShell('broadcast')).toBe(true);
    expect(isImmersiveShell('playback')).toBe(true);
    expect(isImmersiveShell('map')).toBe(true);
    expect(isImmersiveShell('vertical')).toBe(false);
    expect(isImmersiveShell('stream')).toBe(false);
  });

  it('locks viewport for immersive, vertical, and map shells', () => {
    expect(isViewportLockedShell('vertical')).toBe(true);
    expect(isViewportLockedShell('map')).toBe(true);
    expect(isViewportLockedShell('stream')).toBe(false);
  });

  it('hides top and bottom nav for immersive shells only', () => {
    expect(hidesTopNav('broadcast')).toBe(true);
    expect(hidesBottomNav('playback')).toBe(true);
    expect(hidesTopNav('map')).toBe(true);
    expect(hidesBottomNav('map')).toBe(true);
    expect(hidesTopNav('vertical')).toBe(false);
    expect(hidesBottomNav('vertical')).toBe(false);
  });
});
