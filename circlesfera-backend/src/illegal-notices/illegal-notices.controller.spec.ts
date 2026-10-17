import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
import {
  AdminGuard,
  STAFF_PERMISSIONS_KEY,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { TurnstileService } from '../common/abuse/turnstile.service.js';
import {
  ADMIN_BEARER,
  createControllerApp,
  TEST_ADMIN,
  TEST_UUID,
} from '../common/testing/http-controller.js';
import { AdminIllegalNoticesController } from './admin-illegal-notices.controller.js';
import { IllegalNoticesController } from './illegal-notices.controller.js';
import { IllegalNoticesService } from './illegal-notices.service.js';

describe('IllegalNoticesController', () => {
  let app: INestApplication;
  const notices = {
    isOwnAddress: vi.fn(),
    create: vi.fn(),
    list: vi.fn(),
    decide: vi.fn(),
  };
  const turnstile = { assertValid: vi.fn() };

  const notice = {
    contentUrl: 'https://circlesfera.com/p/post-1',
    explanation: 'This post sells counterfeit medicines to anyone.',
    notifierName: 'Ana López',
    notifierEmail: 'ana@example.com',
    goodFaith: true,
    captchaToken: 'tok',
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [IllegalNoticesController, AdminIllegalNoticesController],
      providers: [
        { provide: IllegalNoticesService, useValue: notices },
        { provide: TurnstileService, useValue: turnstile },
      ],
      guards: [
        { guard: AdminJwtAuthGuard, mode: 'admin' },
        { guard: AdminGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    notices.isOwnAddress.mockReturnValue(true);
    notices.create.mockResolvedValue({ reference: 'ABCD1234' });
    turnstile.assertValid.mockResolvedValue(undefined);
  });

  it('takes a notice from anyone, with no session, after the bot check', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/illegal-content-notices')
      .send(notice)
      .expect(201);

    expect(res.body).toEqual({ reference: 'ABCD1234' });
    expect(turnstile.assertValid).toHaveBeenCalledWith(
      'tok',
      expect.anything(),
      null,
    );
    expect(notices.create).toHaveBeenCalled();
  });

  it('asks every element of Art. 16(2): the address, why it is illegal, who notifies and good faith', async () => {
    for (const change of [
      { contentUrl: 'not an address' },
      { explanation: 'too short' },
      { notifierName: undefined },
      { notifierEmail: 'not-an-email' },
      { goodFaith: false },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/illegal-content-notices')
        .send({ ...notice, ...change })
        .expect(400);
    }
    expect(notices.create).not.toHaveBeenCalled();
  });

  it('child sexual abuse material may be notified with no name or email', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/illegal-content-notices')
      .send({
        contentUrl: notice.contentUrl,
        explanation: notice.explanation,
        childAbuse: true,
        goodFaith: true,
      })
      .expect(201);

    expect(notices.create).toHaveBeenCalled();
  });

  it('refuses content that is not on CircleSfera, and a failed bot check', async () => {
    notices.isOwnAddress.mockReturnValue(false);
    await request(app.getHttpServer())
      .post('/api/v1/illegal-content-notices')
      .send(notice)
      .expect(400);

    notices.isOwnAddress.mockReturnValue(true);
    turnstile.assertValid.mockRejectedValue(
      Object.assign(new Error('captcha'), { status: 400 }),
    );
    await request(app.getHttpServer())
      .post('/api/v1/illegal-content-notices')
      .send(notice)
      .expect((res) => expect(res.status).toBeGreaterThanOrEqual(400));

    expect(notices.create).not.toHaveBeenCalled();
  });

  it('staff with the reports permission list and decide notices', async () => {
    expect(
      new Reflector().get(
        STAFF_PERMISSIONS_KEY,
        AdminIllegalNoticesController.prototype.decide,
      ),
    ).toEqual(['reports']);
    notices.list.mockResolvedValue([]);
    notices.decide.mockResolvedValue({ id: TEST_UUID });

    await request(app.getHttpServer())
      .get('/api/v1/admin/illegal-content-notices?status=RECEIVED')
      .set(ADMIN_BEARER)
      .expect(200);
    expect(notices.list).toHaveBeenCalledWith('RECEIVED');

    await request(app.getHttpServer())
      .post(`/api/v1/admin/illegal-content-notices/${TEST_UUID}/decide`)
      .set(ADMIN_BEARER)
      .send({
        outcome: 'ACTIONED',
        reasons: 'The post was removed as illegal.',
      })
      .expect(201);
    expect(notices.decide).toHaveBeenCalledWith(TEST_ADMIN.adminId, TEST_UUID, {
      outcome: 'ACTIONED',
      reasons: 'The post was removed as illegal.',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/illegal-content-notices/${TEST_UUID}/decide`)
      .set(ADMIN_BEARER)
      .send({ outcome: 'MAYBE', reasons: 'x' })
      .expect(400);
  });

  it('an unknown status lists every notice', async () => {
    notices.list.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/v1/admin/illegal-content-notices?status=ALL')
      .set(ADMIN_BEARER)
      .expect(200);
    expect(notices.list).toHaveBeenCalledWith(undefined);
  });
});
