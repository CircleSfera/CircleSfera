import type { INestApplication } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
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
import { createControllerApp } from '../common/testing/http-controller.js';
import { LiveRoomWebhookController } from './live-room-webhook.controller.js';
import { LiveRoomWebhookService } from './live-room-webhook.service.js';

describe('LiveRoomWebhookController (HTTP)', () => {
  let app: INestApplication;
  const rooms = { receive: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [LiveRoomWebhookController],
      providers: [{ provide: LiveRoomWebhookService, useValue: rooms }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    rooms.receive.mockReset().mockResolvedValue(undefined);
  });

  it('hands the exact bytes and the signature to the service, with no session', async () => {
    const event = '{"event":"participant_joined",  "id":"EV_1"}';

    const res = await request(app.getHttpServer())
      .post('/api/v1/live/livekit/webhook')
      .set('content-type', 'application/json')
      .set('authorization', 'signed-token')
      .send(event)
      .expect(200);

    expect(res.body).toEqual({ received: true });
    const [body, authorization] = rooms.receive.mock.calls[0];
    expect(Buffer.isBuffer(body) && body.toString('utf8')).toBe(event);
    expect(authorization).toBe('signed-token');
  });

  it('answers 401 for an event the service finds unsigned', async () => {
    rooms.receive.mockRejectedValueOnce(
      new UnauthorizedException('Live event not signed'),
    );

    await request(app.getHttpServer())
      .post('/api/v1/live/livekit/webhook')
      .set('content-type', 'application/json')
      .send('{"event":"participant_joined"}')
      .expect(401);
  });

  it('is not limited per address: every event comes from the one live service', () => {
    expect(
      Reflect.getMetadata('THROTTLER:SKIPdefault', LiveRoomWebhookController),
    ).toBe(true);
  });

  it('refuses a request with no body', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/live/livekit/webhook')
      .expect(400);
    expect(rooms.receive).not.toHaveBeenCalled();
  });
});
