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

  it('unsubscribes by endpoint without a userId', async () => {
    mockService.unsubscribe.mockResolvedValue({ ok: true });

    const res = await request(app.getHttpServer())
      .delete('/api/v1/push/unsubscribe')
      .query({ endpoint: 'https://push.example/sub-1' })
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ ok: true });
    expect(mockService.unsubscribe).toHaveBeenCalledWith(
      'https://push.example/sub-1',
    );
  });
});
