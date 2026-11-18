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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { BusinessStatsController } from './business-stats.controller.js';
import { BusinessStatsService } from './business-stats.service.js';

const PROFILE = '0b4e5d2c-6a8f-4f8e-9c1a-2d3e4f5a6b7c';

describe('BusinessStatsController', () => {
  let app: INestApplication;
  const stats = { record: vi.fn(), read: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [BusinessStatsController],
      providers: [{ provide: BusinessStatsService, useValue: stats }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: JwtOptionalGuard, mode: 'optional' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    stats.record.mockResolvedValue(undefined);
  });

  it('counts a signed-in visit by the person, without their address', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/business-stats/${PROFILE}/events`)
      .set(BEARER)
      .send({ kind: 'visit' })
      .expect(204);
    expect(stats.record).toHaveBeenCalledWith(
      PROFILE,
      'visit',
      TEST_USER.userId,
      null,
    );
  });

  it('counts a guest by their address', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/business-stats/${PROFILE}/events`)
      .send({ kind: 'call' })
      .expect(204);
    const [, kind, userId, address] = stats.record.mock.calls[0];
    expect([kind, userId]).toEqual(['call', null]);
    expect(typeof address === 'string' || address === null).toBe(true);
  });

  it('refuses a kind it does not know, or a Profile id that is not one', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/business-stats/${PROFILE}/events`)
      .send({ kind: 'purchase' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/business-stats/not-an-id/events')
      .send({ kind: 'visit' })
      .expect(400);
    expect(stats.record).not.toHaveBeenCalled();
  });

  it('reads the statistics of the Profile in use, only with a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/business-stats')
      .expect(401);
    stats.read.mockResolvedValue({ days: 7 });
    const res = await request(app.getHttpServer())
      .get('/api/v1/business-stats?days=7')
      .set(BEARER)
      .expect(200);
    expect(res.body).toEqual({ days: 7 });
    expect(stats.read).toHaveBeenCalledWith(TEST_USER.profileId, 7);
    await request(app.getHttpServer())
      .get('/api/v1/business-stats')
      .set(BEARER)
      .expect(200);
    expect(stats.read).toHaveBeenLastCalledWith(TEST_USER.profileId, undefined);
  });
});
