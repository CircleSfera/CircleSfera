import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEV_PUSH_SW_URL,
  ensurePushServiceWorker,
  getExistingPushRegistration,
  toPushSubscribePayload,
  urlBase64ToUint8Array,
} from './pushServiceWorker';

function mockServiceWorker(partial: {
  getRegistration?: ReturnType<typeof vi.fn>;
  register?: ReturnType<typeof vi.fn>;
  ready?: Promise<ServiceWorkerRegistration>;
}) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration:
        partial.getRegistration ?? vi.fn().mockResolvedValue(undefined),
      register: partial.register ?? vi.fn().mockResolvedValue({}),
      ready: partial.ready ?? new Promise<ServiceWorkerRegistration>(() => {}),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ensurePushServiceWorker', () => {
  it('returns an existing active registration without waiting on ready', async () => {
    const active = { active: {} } as ServiceWorkerRegistration;
    mockServiceWorker({
      getRegistration: vi.fn().mockResolvedValue(active),
      register: vi.fn(),
      ready: new Promise(() => {}),
    });

    await expect(ensurePushServiceWorker(20)).resolves.toBe(active);
    expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
  });

  it('registers the dev worker and rejects if ready never resolves', async () => {
    const register = vi.fn().mockResolvedValue({});
    mockServiceWorker({
      getRegistration: vi.fn().mockResolvedValue(undefined),
      register,
      ready: new Promise(() => {}),
    });

    await expect(ensurePushServiceWorker(30)).rejects.toThrow(
      'SERVICE_WORKER_TIMEOUT',
    );
    expect(register).toHaveBeenCalledWith(DEV_PUSH_SW_URL);
  });

  it('resolves when ready completes after register', async () => {
    const registration = { active: {} } as ServiceWorkerRegistration;
    mockServiceWorker({
      getRegistration: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
    });

    await expect(ensurePushServiceWorker(50)).resolves.toBe(registration);
  });
});

describe('getExistingPushRegistration', () => {
  it('returns null when the API is missing', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });
    await expect(getExistingPushRegistration()).resolves.toBeNull();
  });
});

describe('toPushSubscribePayload', () => {
  it('keeps only endpoint and keys so forbidNonWhitelisted does not reject', () => {
    const payload = toPushSubscribePayload({
      toJSON: () => ({
        endpoint: 'https://push.example.com/abc',
        expirationTime: null,
        keys: { p256dh: 'p', auth: 'a' },
      }),
    } as unknown as PushSubscription);

    expect(payload).toEqual({
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(payload).not.toHaveProperty('expirationTime');
  });

  it('throws when keys are missing', () => {
    expect(() =>
      toPushSubscribePayload({
        toJSON: () => ({ endpoint: 'https://push.example.com/abc' }),
      } as unknown as PushSubscription),
    ).toThrow('INVALID_PUSH_SUBSCRIPTION');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes URL-safe base64 without padding', () => {
    const bytes = urlBase64ToUint8Array('AQID');
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });
});
