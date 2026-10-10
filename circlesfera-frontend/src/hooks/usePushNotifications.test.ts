import { PushNotifications } from '@capacitor/push-notifications';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services';
import { usePushNotifications } from './usePushNotifications';

// Whether the tests run as the app on a phone; the web by default.
const platform = vi.hoisted(() => ({ native: false }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => (platform.native ? 'ios' : 'web'),
  },
}));

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    register: vi.fn(),
    addListener: vi.fn(),
  },
}));

vi.mock('../services', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockPushManager = {
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
};

function mockServiceWorkerReady(
  registration: Partial<ServiceWorkerRegistration> = {},
) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: mockPushManager,
        ...registration,
      }),
    },
  });
}

describe('usePushNotifications (web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: function PushManager() {},
    });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'granted',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      },
    });
    mockPushManager.getSubscription.mockResolvedValue(null);
    mockServiceWorkerReady();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects web push support', async () => {
    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => {
      expect(result.current.isSupported).toBe(true);
    });
    expect(result.current.isSubscribed).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('subscribes via VAPID key and posts subscription JSON', async () => {
    const subscription = {
      endpoint: 'https://push.example.com/abc',
      toJSON: () => ({
        endpoint: 'https://push.example.com/abc',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    };
    mockPushManager.subscribe.mockResolvedValue(subscription);
    vi.mocked(api.get).mockResolvedValue({
      data: { publicKey: 'AQIDBA==' },
    } as never);
    vi.mocked(api.post).mockResolvedValue({} as never);

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => {
      expect(result.current.isSupported).toBe(true);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.requestPermission();
    });

    expect(ok).toBe(true);
    expect(result.current.isSubscribed).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(api.get).toHaveBeenCalledWith('/push/public-key');
    expect(api.post).toHaveBeenCalledWith('/push/subscribe', {
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  it('returns false when the user denies notification permission', async () => {
    vi.mocked(window.Notification.requestPermission).mockResolvedValueOnce(
      'denied',
    );

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => {
      expect(result.current.isSupported).toBe(true);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.requestPermission();
    });

    expect(ok).toBe(false);
    expect(result.current.isSubscribed).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('unsubscribes and notifies backend', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    mockPushManager.getSubscription.mockResolvedValue({
      endpoint: 'https://push.example.com/abc',
      unsubscribe,
    });
    vi.mocked(api.delete).mockResolvedValue({} as never);

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => {
      expect(result.current.isSubscribed).toBe(true);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.unsubscribeUser();
    });

    expect(ok).toBe(true);
    expect(unsubscribe).toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalledWith(
      '/push/unsubscribe?endpoint=https%3A%2F%2Fpush.example.com%2Fabc',
    );
    expect(result.current.isSubscribed).toBe(false);
  });
});

describe('usePushNotifications (on a phone)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platform.native = true;
    vi.mocked(PushNotifications.addListener).mockResolvedValue({
      remove: vi.fn(),
    } as never);
  });

  afterEach(() => {
    platform.native = false;
  });

  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['prompt', 'default'],
    ['prompt-with-rationale', 'default'],
  ])('reads "%s" from the phone as "%s"', async (receive, expected) => {
    vi.mocked(PushNotifications.checkPermissions).mockResolvedValue({
      receive,
    } as never);

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.permission).toBe(expected));
    expect(result.current.isSubscribed).toBe(receive === 'granted');
  });

  it('says blocked, not undecided, when the person refuses the question of the phone', async () => {
    vi.mocked(PushNotifications.checkPermissions).mockResolvedValue({
      receive: 'prompt',
    } as never);
    vi.mocked(PushNotifications.requestPermissions).mockResolvedValue({
      receive: 'denied',
    } as never);
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() =>
      expect(PushNotifications.checkPermissions).toHaveBeenCalled(),
    );

    let subscribed: boolean | undefined;
    await act(async () => {
      subscribed = await result.current.requestPermission();
    });

    expect(subscribed).toBe(false);
    expect(result.current.permission).toBe('denied');
    expect(PushNotifications.register).not.toHaveBeenCalled();
  });
});
