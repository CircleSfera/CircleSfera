import type { INestApplication } from '@nestjs/common';
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
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { LiveController } from './live.controller.js';
import { LiveService } from './live.service.js';

describe('LiveController', () => {
  let app: INestApplication;

  const mockLiveService = {
    startStream: vi.fn(),
    endStream: vi.fn(),
    getActiveStreams: vi.fn(),
    getStream: vi.fn(),
    getViewerToken: vi.fn(),
    inviteCoHost: vi.fn(),
    acceptCoHostInvite: vi.fn(),
    removeCoHost: vi.fn(),
    sendGift: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [LiveController],
      providers: [{ provide: LiveService, useValue: mockLiveService }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: EmailVerifiedGuard, mode: 'allow' },
        { guard: IdentityVerifiedGuard, mode: 'session' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects live routes without a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/live/active').expect(401);
    expect(mockLiveService.getActiveStreams).not.toHaveBeenCalled();
  });

  it('starts a stream as the session profileId', async () => {
    mockLiveService.startStream.mockResolvedValue({
      stream: { id: 'stream-1' },
      token: 'jwt',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/live/start')
      .set(BEARER)
      .send({ title: 'My Stream' })
      .expect(201);

    expect(res.body).toEqual({ stream: { id: 'stream-1' }, token: 'jwt' });
    expect(mockLiveService.startStream).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'My Stream',
    );
  });

  it('ends a stream as the session profileId', async () => {
    mockLiveService.endStream.mockResolvedValue({ success: true });

    const res = await request(app.getHttpServer())
      .post('/api/v1/live/end')
      .set(BEARER)
      .expect(201);

    expect(res.body).toEqual({ success: true });
    expect(mockLiveService.endStream).toHaveBeenCalledWith(TEST_USER.profileId);
  });

  it('lists active streams for the session', async () => {
    mockLiveService.getActiveStreams.mockResolvedValue([{ id: 'stream-1' }]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/live/active')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual([{ id: 'stream-1' }]);
    expect(mockLiveService.getActiveStreams).toHaveBeenCalled();
  });

  it('issues a viewer token as the session userId', async () => {
    mockLiveService.getViewerToken.mockResolvedValue({ token: 'jwt-viewer' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/live/join/stream-1')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ token: 'jwt-viewer' });
    expect(mockLiveService.getViewerToken).toHaveBeenCalledWith(
      'stream-1',
      TEST_USER.userId,
    );
  });

  it('rejects a gift with a client-supplied amount', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/live/stream-1/gift')
      .set(BEARER)
      .send({ giftId: 'rose', amountCents: 1 })
      .expect(400);

    expect(mockLiveService.sendGift).not.toHaveBeenCalled();
  });

  it('sends a gift as the session userId without a client price', async () => {
    mockLiveService.sendGift.mockResolvedValue({ url: 'https://example.com' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/live/stream-1/gift')
      .set(BEARER)
      .set('idempotency-key', 'gift-1')
      .send({
        giftId: 'rose',
        returnUrl: 'https://example.com/live/stream-1',
      })
      .expect(201);

    expect(res.body).toEqual({ url: 'https://example.com' });
    expect(mockLiveService.sendGift).toHaveBeenCalledWith(
      'stream-1',
      TEST_USER.userId,
      'rose',
      'https://example.com/live/stream-1',
      'gift-1',
    );
  });
});
