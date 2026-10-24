import { PushNotifications } from '@capacitor/push-notifications';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services';
import { useAuthStore } from '../stores/authStore';
import { usePushNotifications } from './usePushNotifications';

// Whether the tests run as the app on a phone, and which one; the web by
// default.
const platform = vi.hoisted(() => ({
  native: false,
  os: 'ios' as 'ios' | 'android',
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => (platform.native ? platform.os : 'web'),
  },
}));

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
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

// The account signed in on the phone (User.id).
function signIn(userId: string) {
  useAuthStore.setState({
    isAuthenticated: true,
    profile: { userId } as never,
  });
}

// The listener the hook gave the phone for Apple's token.
function registrationListener() {
  const calls = vi.mocked(PushNotifications.addListener).mock
    .calls as unknown as [string, (token: { value: string }) => void][];
  return calls.find(([event]) => event === 'registration')?.[1];
}

describe('usePushNotifications (on a phone)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platform.native = true;
    vi.mocked(PushNotifications.addListener).mockResolvedValue({
      remove: vi.fn(),
    } as never);
    vi.mocked(PushNotifications.unregister).mockResolvedValue(
      undefined as never,
    );
  });

  afterEach(() => {
    platform.native = false;
    platform.os = 'ios';
    useAuthStore.setState({ isAuthenticated: false, profile: null });
    localStorage.clear();
  });

  it("sends the iPhone's Apple token to the server once the phone gives it", async () => {
    vi.mocked(PushNotifications.checkPermissions).mockResolvedValue({
      receive: 'granted',
    } as never);
    vi.mocked(api.post).mockResolvedValue({} as never);
    signIn('u1');
    renderHook(() => usePushNotifications());

    const registration = registrationListener();
    expect(registration).toBeDefined();
    registration?.({ value: 'a1b2c3' });

    expect(api.post).toHaveBeenCalledWith('/push/subscribe-native', {
      token: 'a1b2c3',
      platform: 'ios',
    });
    expect(localStorage.getItem('cs_native_push_token')).toBe('a1b2c3');
  });

  it('registers the iPhone again once a person is signed in and the phone allows push', async () => {
    vi.mocked(PushNotifications.checkPermissions).mockResolvedValue({
      receive: 'granted',
    } as never);
    useAuthStore.setState({ isAuthenticated: false });
    const { rerender } = renderHook(() => usePushNotifications());
    await waitFor(() =>
      expect(PushNotifications.checkPermissions).toHaveBeenCalled(),
    );
    expect(PushNotifications.register).not.toHaveBeenCalled();

    act(() => signIn('u1'));
    rerender();

    await waitFor(() => expect(PushNotifications.register).toHaveBeenCalled());
  });

  it('does not register again after the person turned push off here, and shows it off', async () => {
    vi.mocked(PushNotifications.checkPermissions).mockResolvedValue({
      receive: 'granted',
    } as never);
    signIn('u1');
    const first = renderHook(() => usePushNotifications());
    await waitFor(() => expect(PushNotifications.register).toHaveBeenCalled());

    await act(async () => {
      await first.result.current.unsubscribeUser();
    });
    first.unmount();
    vi.mocked(PushNotifications.register).mockClear();

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.permission).toBe('granted'));
    expect(result.current.isSubscribed).toBe(false);
    expect(PushNotifications.register).not.toHaveBeenCalled();

    // Turning it on again here clears that.
    await act(async () => {
      await result.current.requestPermission();
    });
    expect(PushNotifications.register).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('cs_native_push_off:u1')).toBeNull();
  });

  it('does not send the token Apple gives after push was turned off here, and takes the phone off again', async () => {
    vi.mocked(PushNotifications.checkPermissions).mockResolvedValue({
      receive: 'granted',
    } as never);
    signIn('u1');
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(PushNotifications.register).toHaveBeenCalled());

    await act(async () => {
      await result.current.unsubscribeUser();
    });
    vi.mocked(PushNotifications.unregister).mockClear();
    // Apple answers the earlier register() only now.
    registrationListener()?.({ value: 'a1b2c3' });

    expect(api.post).not.toHaveBeenCalled();
    expect(PushNotifications.unregister).toHaveBeenCalled();
    expect(localStorage.getItem('cs_native_push_token')).toBeNull();
  });

  it('does not send the token Apple gives once nobody is signed in', async () => {
    renderHook(() => usePushNotifications());

    registrationListener()?.({ value: 'a1b2c3' });

    expect(api.post).not.toHaveBeenCalled();
    expect(PushNotifications.unregister).toHaveBeenCalled();
  });

  it('registers nothing when push is turned off while the phone is still being asked', async () => {
    let answer: (status: { receive: string }) => void = () => undefined;
    vi.mocked(PushNotifications.checkPermissions).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve as never;
        }) as never,
    );
    signIn('u1');
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() =>
      expect(PushNotifications.checkPermissions).toHaveBeenCalled(),
    );

    await act(async () => {
      await result.current.unsubscribeUser();
    });
    await act(async () => {
      answer({ receive: 'granted' });
    });

    expect(PushNotifications.register).not.toHaveBeenCalled();
  });

  it('keeps push turned off for the account that turned it off only', async () => {
    vi.mocked(PushNotifications.checkPermissions).mockResolvedValue({
      receive: 'granted',
    } as never);
    signIn('u1');
    const first = renderHook(() => usePushNotifications());
    await waitFor(() => expect(PushNotifications.register).toHaveBeenCalled());
    await act(async () => {
      await first.result.current.unsubscribeUser();
    });
    first.unmount();
    vi.mocked(PushNotifications.register).mockClear();

    // Another person signs in on the same phone.
    signIn('u2');
    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(PushNotifications.register).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
  });

  it('offers no push in the Android app: it asks nothing and registers nothing', async () => {
    platform.os = 'android';
    const { result } = renderHook(() => usePushNotifications());

    let subscribed: boolean | undefined;
    await act(async () => {
      subscribed = await result.current.requestPermission();
    });

    expect(subscribed).toBe(false);
    expect(result.current.isSupported).toBe(false);
    expect(result.current.isAndroidApp).toBe(true);
    expect(PushNotifications.checkPermissions).not.toHaveBeenCalled();
    expect(PushNotifications.requestPermissions).not.toHaveBeenCalled();
    expect(PushNotifications.addListener).not.toHaveBeenCalled();
    expect(PushNotifications.register).not.toHaveBeenCalled();
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
