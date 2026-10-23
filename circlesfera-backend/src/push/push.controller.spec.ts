import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

describe('PushController', () => {
  let app: INestApplication;

  const mockService = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    subscribeNative: vi.fn(),
    unsubscribeNative: vi.fn(),
  };

  const mockConfig = {
    get: vi.fn(),
  };

  const subscribeDto = {
    endpoint: 'https://push.example/sub-1',
    keys: { p256dh: 'key-1', auth: 'auth-1' },
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [PushController],
      providers: [
        { provide: PushService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfig },
      ],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the configured VAPID public key without a session', async () => {
    mockConfig.get.mockReturnValue('test-vapid-public');

    const res = await request(app.getHttpServer())
      .get('/api/v1/push/public-key')
      .expect(200);

    expect(res.body).toEqual({ publicKey: 'test-vapid-public' });
    expect(mockConfig.get).toHaveBeenCalledWith('VAPID_PUBLIC_KEY');
  });

  it('rejects subscribe without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/push/subscribe')
      .send(subscribeDto)
      .expect(401);

    expect(mockService.subscribe).not.toHaveBeenCalled();
  });

  it('rejects subscribe with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/push/subscribe')
      .set(BEARER)
      .send({ ...subscribeDto, userId: 'attacker' })
      .expect(400);

    expect(mockService.subscribe).not.toHaveBeenCalled();
  });

  it('subscribes as the session userId', async () => {
    mockService.subscribe.mockResolvedValue({ ok: true });

    const res = await request(app.getHttpServer())
      .post('/api/v1/push/subscribe')
      .set(BEARER)
      .send(subscribeDto)
      .expect(201);

    expect(res.body).toEqual({ ok: true });
    expect(mockService.subscribe).toHaveBeenCalledWith(
      TEST_USER.userId,
      subscribeDto,
    );
  });

  it('takes off a device of the person signed in only', async () => {
    mockService.unsubscribe.mockResolvedValue({ ok: true });

    const res = await request(app.getHttpServer())
      .delete('/api/v1/push/unsubscribe')
      .query({ endpoint: 'https://push.example/sub-1' })
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ ok: true });
    expect(mockService.unsubscribe).toHaveBeenCalledWith(
      TEST_USER.userId,
      'https://push.example/sub-1',
    );
  });

  it('keeps the token of a native app as the session userId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/push/subscribe-native')
      .set(BEARER)
      .send({ token: 'a1b2c3d4', platform: 'ios' })
      .expect(201);

    expect(res.body).toEqual({ success: true });
    expect(mockService.subscribeNative).toHaveBeenCalledWith(TEST_USER.userId, {
      token: 'a1b2c3d4',
      platform: 'ios',
    });
  });

  it.each([
    ['no session', {}, { token: 'a1b2', platform: 'ios' }, 401],
    [
      'a platform it does not know',
      BEARER,
      { token: 'a1b2', platform: 'web' },
      400,
    ],
    ['no token', BEARER, { platform: 'ios' }, 400],
    // The Android app has no push.
    [
      'the Android platform',
      BEARER,
      { token: 'a1b2', platform: 'android' },
      400,
    ],
    [
      'a token too long',
      BEARER,
      { token: 'a'.repeat(201), platform: 'ios' },
      400,
    ],
    // The token becomes part of the address Apple is called on.
    [
      'a token that is not hexadecimal',
      BEARER,
      { token: '../x', platform: 'ios' },
      400,
    ],
  ])('refuses a native token with %s', async (_what, headers, body, code) => {
    mockService.subscribeNative.mockClear();
    await request(app.getHttpServer())
      .post('/api/v1/push/subscribe-native')
      .set(headers as Record<string, string>)
      .send(body)
      .expect(code);
    expect(mockService.subscribeNative).not.toHaveBeenCalled();
  });

  it('takes off a device of the native app of the person signed in only', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/push/unsubscribe-native')
      .query({ token: 'a1b2c3d4' })
      .set(BEARER)
      .expect(200);
    expect(mockService.unsubscribeNative).toHaveBeenCalledWith(
      TEST_USER.userId,
      'a1b2c3d4',
    );

    mockService.unsubscribeNative.mockClear();
    await request(app.getHttpServer())
      .delete('/api/v1/push/unsubscribe-native')
      .set(BEARER)
      .expect(200);
    expect(mockService.unsubscribeNative).not.toHaveBeenCalled();
  });
});
