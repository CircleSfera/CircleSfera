import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getExistingPushRegistration,
  toPushSubscribePayload,
  urlBase64ToUint8Array,
} from './pushServiceWorker';

afterEach(() => {
  vi.unstubAllGlobals();
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
