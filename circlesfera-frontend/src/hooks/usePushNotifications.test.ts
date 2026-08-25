import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushApi } from '../services';
import { ensurePushServiceWorker } from '../utils/pushServiceWorker';
import { usePushNotifications } from './usePushNotifications';

vi.mock('../services', () => ({
  pushApi: {
    getPublicKey: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));

vi.mock('../utils/pushServiceWorker', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/pushServiceWorker')>();
  return {
    ...actual,
    ensurePushServiceWorker: vi.fn(),
    getExistingPushRegistration: vi.fn().mockResolvedValue(null),
  };
});

const mockPushManager = {
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
};

describe('usePushNotifications', () => {
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
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(null),
        register: vi.fn(),
        ready: new Promise(() => {}),
      },
    });
    mockPushManager.getSubscription.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not leave loading stuck when the service worker never becomes ready', async () => {
    vi.mocked(ensurePushServiceWorker).mockRejectedValue(
      new Error('SERVICE_WORKER_TIMEOUT'),
    );

    const { result } = renderHook(() => usePushNotifications());

    let ok = true;
    await act(async () => {
      ok = await result.current.requestPermission();
    });

    expect(ok).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.isSubscribed).toBe(false);
  });

  it('subscribes and posts only endpoint + keys', async () => {
    const registration = {
      active: {},
      pushManager: mockPushManager,
    } as unknown as ServiceWorkerRegistration;
    vi.mocked(ensurePushServiceWorker).mockResolvedValue(registration);

    const subscription = {
      endpoint: 'https://push.example.com/abc',
      toJSON: () => ({
        endpoint: 'https://push.example.com/abc',
        expirationTime: null,
        keys: { p256dh: 'p', auth: 'a' },
      }),
    };
    mockPushManager.subscribe.mockResolvedValue(subscription);
    vi.mocked(pushApi.getPublicKey).mockResolvedValue({
      data: { publicKey: 'AQID' },
    } as Awaited<ReturnType<typeof pushApi.getPublicKey>>);
    vi.mocked(pushApi.subscribe).mockResolvedValue({} as never);

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
    expect(pushApi.subscribe).toHaveBeenCalledWith({
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(mockPushManager.subscribe).toHaveBeenCalled();
  });

  it('rolls back the local subscription if the backend rejects it', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const registration = {
      active: {},
      pushManager: mockPushManager,
    } as unknown as ServiceWorkerRegistration;
    vi.mocked(ensurePushServiceWorker).mockResolvedValue(registration);

    const subscription = {
      endpoint: 'https://push.example.com/abc',
      unsubscribe,
      toJSON: () => ({
        endpoint: 'https://push.example.com/abc',
        expirationTime: null,
        keys: { p256dh: 'p', auth: 'a' },
      }),
    };
    mockPushManager.getSubscription.mockResolvedValue(null);
    mockPushManager.subscribe.mockResolvedValue(subscription);
    vi.mocked(pushApi.getPublicKey).mockResolvedValue({
      data: { publicKey: 'AQID' },
    } as Awaited<ReturnType<typeof pushApi.getPublicKey>>);
    vi.mocked(pushApi.subscribe).mockRejectedValue(new Error('400'));

    const { result } = renderHook(() => usePushNotifications());

    let ok = true;
    await act(async () => {
      ok = await result.current.requestPermission();
    });

    expect(ok).toBe(false);
    expect(unsubscribe).toHaveBeenCalled();
    expect(result.current.isSubscribed).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('reuses an in-flight subscribe instead of returning false', async () => {
    const registration = {
      active: {},
      pushManager: mockPushManager,
    } as unknown as ServiceWorkerRegistration;
    vi.mocked(ensurePushServiceWorker).mockResolvedValue(registration);

    mockPushManager.subscribe.mockResolvedValue({
      endpoint: 'https://push.example.com/abc',
      toJSON: () => ({
        endpoint: 'https://push.example.com/abc',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    });
    vi.mocked(pushApi.getPublicKey).mockResolvedValue({
      data: { publicKey: 'AQID' },
    } as Awaited<ReturnType<typeof pushApi.getPublicKey>>);

    let releaseSubscribe: (value: unknown) => void = () => {};
    vi.mocked(pushApi.subscribe).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSubscribe = resolve;
        }) as never,
    );

    const { result } = renderHook(() => usePushNotifications());

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = result.current.requestPermission();
      second = result.current.requestPermission();
    });

    await act(async () => {
      releaseSubscribe({});
      await expect(first).resolves.toBe(true);
      await expect(second).resolves.toBe(true);
    });

    expect(pushApi.subscribe).toHaveBeenCalledTimes(1);
    expect(result.current.isSubscribed).toBe(true);
  });
});
