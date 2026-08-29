import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services';
import { usePushNotifications } from './usePushNotifications';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
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
