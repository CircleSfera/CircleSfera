import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSecurityStore } from '../stores/securityStore';
import { useNativeApp } from './useNativeApp';

type Listener = (event: never) => void;

const native = vi.hoisted(() => ({
  isNative: true,
  platform: 'ios',
  listeners: [] as {
    name: string;
    run: (event: unknown) => void;
    removed: boolean;
  }[],
  setStyle: vi.fn(),
  setOverlaysWebView: vi.fn(),
  hideSplash: vi.fn(),
  setAccessoryBarVisible: vi.fn(),
  failListeners: false,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native.isNative,
    getPlatform: () => native.platform,
  },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (name: string, run: Listener) => {
      if (native.failListeners) return Promise.reject(new Error('no bridge'));
      const entry = {
        name,
        run: run as (event: unknown) => void,
        removed: false,
      };
      native.listeners.push(entry);
      return Promise.resolve({
        remove: async () => {
          entry.removed = true;
        },
      });
    },
  },
}));
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setStyle: native.setStyle,
    setOverlaysWebView: native.setOverlaysWebView,
  },
  Style: { Dark: 'DARK' },
}));
vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: { hide: native.hideSplash },
}));
vi.mock('@capacitor/keyboard', () => ({
  Keyboard: { setAccessoryBarVisible: native.setAccessoryBarVisible },
}));

let go: ReturnType<typeof useNavigate>;
let where = '';
function Shell() {
  useNativeApp();
  go = useNavigate();
  const location = useLocation();
  where = location.pathname + location.search + location.hash;
  return null;
}

const start = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Shell />
    </MemoryRouter>,
  );
const live = (name: string) =>
  native.listeners.filter((l) => l.name === name && !l.removed);
const settled = () =>
  waitFor(() => expect(native.hideSplash).toHaveBeenCalled());

describe('useNativeApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.isNative = true;
    native.platform = 'ios';
    native.listeners.length = 0;
    native.failListeners = false;
    for (const fn of [
      native.setStyle,
      native.setOverlaysWebView,
      native.hideSplash,
      native.setAccessoryBarVisible,
    ]) {
      fn.mockResolvedValue(undefined);
    }
    useSecurityStore.setState({ isBiometricEnabled: false, isLocked: false });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('does nothing in a browser', async () => {
    native.isNative = false;
    start();
    await Promise.resolve();

    expect(native.setStyle).not.toHaveBeenCalled();
    expect(native.hideSplash).not.toHaveBeenCalled();
    expect(native.listeners).toHaveLength(0);
  });

  it('prepares the status bar, the splash screen and the keyboard on an iPhone', async () => {
    start();
    await settled();
    await waitFor(() => expect(live('appStateChange')).toHaveLength(1));

    expect(native.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
    expect(native.setOverlaysWebView).toHaveBeenCalledWith({ overlay: true });
    expect(native.setAccessoryBarVisible).toHaveBeenCalledWith({
      isVisible: false,
    });
  });

  it('leaves out what only an iPhone has on Android', async () => {
    native.platform = 'android';
    start();
    await settled();

    expect(native.setStyle).toHaveBeenCalled();
    expect(native.setOverlaysWebView).not.toHaveBeenCalled();
    expect(native.setAccessoryBarVisible).not.toHaveBeenCalled();
  });

  it('carries on when a piece of the device is missing', async () => {
    native.setStyle.mockRejectedValue(new Error('no status bar'));
    native.hideSplash.mockRejectedValue(new Error('no splash'));
    native.setAccessoryBarVisible.mockRejectedValue(new Error('no keyboard'));
    native.failListeners = true;

    start();
    await settled();
    await waitFor(() => expect(console.warn).toHaveBeenCalledTimes(5));
  });

  describe('a link that opens the app', () => {
    const openLink = async (url: string) => {
      start();
      await waitFor(() => expect(live('appUrlOpen')).toHaveLength(1));
      act(() => live('appUrlOpen')[0].run({ url }));
    };

    it.each([
      ['https://circlesfera.com/p/abc?from=mail#top', '/p/abc?from=mail#top'],
      ['https://www.circlesfera.com/ana', '/ana'],
    ])('goes to the page of %s', async (url, page) => {
      await openLink(url);
      expect(where).toBe(page);
    });

    it.each([
      'https://evil.example/p/abc',
      'https://notcirclesfera.com/p/abc',
      'https://circlesfera.com.evil.example/p/abc',
    ])('ignores a link of another site (%s)', async (url) => {
      await openLink(url);
      expect(where).toBe('/');
    });
  });

  it('keeps one listener of each kind however many pages are visited', async () => {
    start();
    await waitFor(() => expect(live('appUrlOpen')).toHaveLength(1));

    act(() => go('/explore'));
    act(() => go('/frames'));
    await Promise.resolve();

    expect(live('appUrlOpen')).toHaveLength(1);
    expect(live('appStateChange')).toHaveLength(1);
    expect(native.hideSplash).toHaveBeenCalledTimes(1);

    act(() =>
      live('appUrlOpen')[0].run({ url: 'https://circlesfera.com/ana' }),
    );
    expect(where).toBe('/ana');
  });

  it('removes its listeners when the app shell goes away', async () => {
    const { unmount } = start();
    await waitFor(() => expect(live('appStateChange')).toHaveLength(1));

    unmount();

    await waitFor(() =>
      expect(native.listeners.every((l) => l.removed)).toBe(true),
    );
    expect(native.listeners).toHaveLength(2);
  });

  describe('leaving the app', () => {
    const leave = async (isActive: boolean) => {
      start();
      await waitFor(() => expect(live('appStateChange')).toHaveLength(1));
      act(() => live('appStateChange')[0].run({ isActive }));
    };

    it('locks it when the app lock is on', async () => {
      useSecurityStore.setState({ isBiometricEnabled: true, isLocked: false });
      await leave(false);
      expect(useSecurityStore.getState().isLocked).toBe(true);
    });

    it('does not lock it when the app lock is off', async () => {
      await leave(false);
      expect(useSecurityStore.getState().isLocked).toBe(false);
    });

    it('does not lock it on coming back', async () => {
      useSecurityStore.setState({ isBiometricEnabled: true, isLocked: false });
      await leave(true);
      expect(useSecurityStore.getState().isLocked).toBe(false);
    });
  });
});
