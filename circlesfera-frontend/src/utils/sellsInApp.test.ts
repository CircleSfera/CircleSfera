import { beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }));

import { sellsInApp } from './sellsInApp';

describe('sellsInApp', () => {
  beforeEach(() => isNativePlatform.mockReset());

  it('sells on the web', () => {
    isNativePlatform.mockReturnValue(false);
    expect(sellsInApp()).toBe(true);
  });

  it('sells nothing in the iOS and Android apps', () => {
    isNativePlatform.mockReturnValue(true);
    expect(sellsInApp()).toBe(false);
  });
});
