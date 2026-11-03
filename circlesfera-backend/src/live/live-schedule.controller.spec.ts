import { readFileSync } from 'node:fs';
import { ErrorCode } from '@circlesfera/shared';
import type { INestApplication, Type } from '@nestjs/common';
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
import { AppException } from '../common/errors/app.exception.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { LiveController } from './live.controller.js';
import { LiveService } from './live.service.js';
import { LiveGiftService } from './live-gift.service.js';
import { LiveScheduleController } from './live-schedule.controller.js';
import { LiveScheduleService } from './live-schedule.service.js';
import { LiveStartNoticeService } from './live-start-notice.service.js';

// The live module's controllers, in the order it registers them, read from
// its source: importing the module would load every module it depends on.
const MODULE_CONTROLLERS =
  /controllers:\s*\[([^\]]*)\]/
    .exec(
      readFileSync(new URL('./live.module.ts', import.meta.url), 'utf8'),
    )?.[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean) ?? [];
const CONTROLLERS: Record<string, Type> = {
  LiveScheduleController,
  LiveController,
};

const ID = '0b6c1a52-5f0e-4f1a-9d43-3f2b5d1c7a10';
const HOST = '5d8e2f8c-3a1b-4c55-9b0e-7f1d2c3b4a59';

describe('LiveScheduleController', () => {
  let app: INestApplication;

  const schedule = {
    schedule: vi.fn(),
    listUpcoming: vi.fn(),
    cancel: vi.fn(),
    remind: vi.fn(),
    unremind: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [LiveScheduleController],
      providers: [{ provide: LiveScheduleService, useValue: schedule }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: EmailVerifiedGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const server = () => request(app.getHttpServer());

  it('refuses every route without a session', async () => {
    await server().get(`/api/v1/live/scheduled?profileId=${HOST}`).expect(401);
    await server().post('/api/v1/live/scheduled').send({}).expect(401);
    await server().delete(`/api/v1/live/scheduled/${ID}`).expect(401);
    await server().post(`/api/v1/live/scheduled/${ID}/reminder`).expect(401);
    await server().delete(`/api/v1/live/scheduled/${ID}/reminder`).expect(401);
    for (const fn of Object.values(schedule)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('schedules a live as the Profile of the session', async () => {
    schedule.schedule.mockResolvedValue({ id: ID, reminded: false });
    const body = {
      title: 'Ensayo',
      audience: 'CLOSE_FRIENDS',
      startsAt: '2026-12-01T20:00:00.000Z',
    };

    const res = await server()
      .post('/api/v1/live/scheduled')
      .set(BEARER)
      .send(body)
      .expect(201);

    expect(res.body).toEqual({ id: ID, reminded: false });
    expect(schedule.schedule).toHaveBeenCalledWith(
      TEST_USER.profileId,
      expect.objectContaining(body),
    );
  });

  it('refuses a body that does not validate, before the service', async () => {
    await server()
      .post('/api/v1/live/scheduled')
      .set(BEARER)
      .send({ title: '', startsAt: 'soon' })
      .expect(400);
    expect(schedule.schedule).not.toHaveBeenCalled();
  });

  it('answers the coded refusal of the service', async () => {
    schedule.schedule.mockRejectedValue(
      AppException.Conflict(ErrorCode.LIVE_SCHEDULED_LIMIT, 'Too many', {
        max: 5,
      }),
    );

    const res = await server()
      .post('/api/v1/live/scheduled')
      .set(BEARER)
      .send({ title: 'Ensayo', startsAt: '2026-12-01T20:00:00.000Z' })
      .expect(409);

    expect(res.body).toMatchObject({
      errorCode: ErrorCode.LIVE_SCHEDULED_LIMIT,
      details: { max: 5 },
    });
  });

  it("lists a Profile's upcoming lives for the viewer of the session", async () => {
    schedule.listUpcoming.mockResolvedValue([{ id: ID, reminded: true }]);

    const res = await server()
      .get(`/api/v1/live/scheduled?profileId=${HOST}`)
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual([{ id: ID, reminded: true }]);
    expect(schedule.listUpcoming).toHaveBeenCalledWith(
      HOST,
      TEST_USER.profileId,
    );
  });

  it('refuses a list with no Profile, or one that is not an id', async () => {
    await server().get('/api/v1/live/scheduled').set(BEARER).expect(400);
    await server()
      .get('/api/v1/live/scheduled?profileId=me')
      .set(BEARER)
      .expect(400);
    expect(schedule.listUpcoming).not.toHaveBeenCalled();
  });

  it('cancels as the host of the session', async () => {
    schedule.cancel.mockResolvedValue({ success: true });

    await server()
      .delete(`/api/v1/live/scheduled/${ID}`)
      .set(BEARER)
      .expect(200, { success: true });
    expect(schedule.cancel).toHaveBeenCalledWith(TEST_USER.profileId, ID);
  });

  it('asks for and takes back a reminder as the viewer of the session', async () => {
    schedule.remind.mockResolvedValue({ reminded: true });
    schedule.unremind.mockResolvedValue({ reminded: false });

    await server()
      .post(`/api/v1/live/scheduled/${ID}/reminder`)
      .set(BEARER)
      .expect(201, { reminded: true });
    await server()
      .delete(`/api/v1/live/scheduled/${ID}/reminder`)
      .set(BEARER)
      .expect(200, { reminded: false });

    expect(schedule.remind).toHaveBeenCalledWith(ID, TEST_USER.profileId);
    expect(schedule.unremind).toHaveBeenCalledWith(ID, TEST_USER.profileId);
  });

  it('answers not found as the service does', async () => {
    schedule.remind.mockRejectedValue(
      AppException.NotFound(ErrorCode.SCHEDULED_LIVE_NOT_FOUND),
    );

    const res = await server()
      .post(`/api/v1/live/scheduled/${ID}/reminder`)
      .set(BEARER)
      .expect(404);
    expect(res.body.errorCode).toBe(ErrorCode.SCHEDULED_LIVE_NOT_FOUND);
  });

  it('refuses an id that is not one', async () => {
    await server().delete('/api/v1/live/scheduled/abc').set(BEARER).expect(400);
    await server()
      .post('/api/v1/live/scheduled/abc/reminder')
      .set(BEARER)
      .expect(400);
    expect(schedule.cancel).not.toHaveBeenCalled();
    expect(schedule.remind).not.toHaveBeenCalled();
  });
});

describe('the routes of scheduled lives beside those of a live', () => {
  let app: INestApplication;
  const schedule = { listUpcoming: vi.fn(async () => []) };
  const live = { getStream: vi.fn(async () => ({})) };

  beforeAll(async () => {
    app = await createControllerApp({
      // In the order the live module registers them.
      controllers: MODULE_CONTROLLERS.map((name) => CONTROLLERS[name]).filter(
        Boolean,
      ),
      providers: [
        { provide: LiveScheduleService, useValue: schedule },
        { provide: LiveService, useValue: live },
        { provide: LiveGiftService, useValue: {} },
        { provide: LiveStartNoticeService, useValue: {} },
      ],
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

  it('registers the routes of scheduled lives before those of a live', () => {
    expect(MODULE_CONTROLLERS.indexOf('LiveScheduleController')).toBe(0);
    expect(MODULE_CONTROLLERS.indexOf('LiveController')).toBeGreaterThan(0);
  });

  it('answers /live/scheduled with the scheduled lives, never as the id of a live', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/live/scheduled?profileId=${HOST}`)
      .set(BEARER)
      .expect(200, []);

    expect(schedule.listUpcoming).toHaveBeenCalled();
    expect(live.getStream).not.toHaveBeenCalled();
  });
});
