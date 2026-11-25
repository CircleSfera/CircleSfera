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
import {
  AdminGuard,
  STAFF_PERMISSIONS_KEY,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
  TEST_USER,
  TEST_UUID,
} from '../common/testing/http-controller.js';
import { AdminFoundingCreatorsController } from './admin-founding-creators.controller.js';
import { FoundingCreatorsController } from './founding-creators.controller.js';
import { FoundingCreatorsService } from './founding-creators.service.js';
import { FoundingCreatorsReviewService } from './founding-creators-review.service.js';

describe('FoundingCreatorsController', () => {
  let app: INestApplication;
  const service = {
    status: vi.fn(),
    apply: vi.fn(),
    startFreeYear: vi.fn(),
  };
  const who = [TEST_USER.userId, TEST_USER.profileId];
  const valid = {
    links: ['https://vimeo.com/ana', 'https://www.tiktok.com/@ana'],
    city: ' Valencia ',
    note: ' Short-video editor ',
  };
  const send = (body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/founding-creators')
      .set(BEARER)
      .send(body);

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [FoundingCreatorsController],
      providers: [{ provide: FoundingCreatorsService, useValue: service }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(service)) fn.mockResolvedValue({ ok: 1 });
  });

  it('acts only for the session, and needs one', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/founding-creators')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/founding-creators')
      .set(BEARER)
      .expect(200, { ok: 1 });
    expect(service.status).toHaveBeenCalledWith(...who);
  });

  it('takes an application of 1 to 3 web links, a city and a note, trimmed', async () => {
    await send(valid).expect(201);
    expect(service.apply).toHaveBeenCalledWith(...who, {
      links: valid.links,
      city: 'Valencia',
      note: 'Short-video editor',
    });
    await send({ links: [' https://vimeo.com/ana '], city: 'Valencia' }).expect(
      201,
    );
    expect(service.apply).toHaveBeenLastCalledWith(...who, {
      links: ['https://vimeo.com/ana'],
      city: 'Valencia',
    });
  });

  it.each([
    ['no link', { ...valid, links: [] }],
    [
      'four links',
      {
        ...valid,
        links: [
          'https://a.es/1',
          'https://a.es/2',
          'https://a.es/3',
          'https://a.es/4',
        ],
      },
    ],
    ['a link that is not a web address', { ...valid, links: ['my reel'] }],
    ['a link without its protocol', { ...valid, links: ['vimeo.com/ana'] }],
    ['a link that runs a script', { ...valid, links: ['javascript:alert(1)'] }],
    ['a link of another protocol', { ...valid, links: ['ftp://a.es/reel'] }],
    [
      'a link too long',
      { ...valid, links: [`https://a.es/${'x'.repeat(300)}`] },
    ],
    ['links that are not a list', { ...valid, links: 'https://a.es' }],
    ['no city', { links: valid.links }],
    ['a city of one letter', { ...valid, city: ' V ' }],
    ['a city too long', { ...valid, city: 'V'.repeat(81) }],
    ['a note too long', { ...valid, note: 'n'.repeat(501) }],
    ['a field it does not know', { ...valid, plan: 'premium' }],
  ])('refuses an application with %s', async (_what, body) => {
    await send(body).expect(400);
    expect(service.apply).not.toHaveBeenCalled();
  });

  it('starts the free year of the session Profile', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/founding-creators/free-year')
      .set(BEARER)
      .expect(200, { ok: 1 });
    expect(service.startFreeYear).toHaveBeenCalledWith(...who);
  });
});

describe('AdminFoundingCreatorsController', () => {
  const review = { queue: vi.fn(), decide: vi.fn() };
  // The real staff guard: only the permission opens it.
  const appFor = (permissions: string[], roles: string[]) =>
    createControllerApp({
      controllers: [AdminFoundingCreatorsController],
      providers: [{ provide: FoundingCreatorsReviewService, useValue: review }],
      guards: [{ guard: AdminJwtAuthGuard, mode: 'admin' }],
      admin: { ...TEST_ADMIN, permissions, roles },
    });
  let allowed: INestApplication;
  let support: INestApplication;

  beforeAll(async () => {
    allowed = await appFor(['founding_creators'], ['PLATFORM_ADMIN']);
    support = await appFor(
      ['support', 'company_verification', 'payments'],
      ['SUPPORT_ADMIN'],
    );
  });
  afterAll(async () => {
    await allowed.close();
    await support.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    review.queue.mockResolvedValue({ items: [], total: 0 });
    review.decide.mockResolvedValue({ id: TEST_UUID });
  });

  it('is for staff with the founding-creators permission only, through AdminIdentity roles', async () => {
    expect(
      Reflect.getMetadata(
        STAFF_PERMISSIONS_KEY,
        AdminFoundingCreatorsController,
      ),
    ).toEqual(['founding_creators']);
    expect(
      Reflect.getMetadata('__guards__', AdminFoundingCreatorsController),
    ).toEqual([AdminJwtAuthGuard, AdminGuard]);

    await request(support.getHttpServer())
      .get('/api/v1/admin/founding-creators')
      .set(ADMIN_BEARER)
      .expect(403);
    await request(support.getHttpServer())
      .post(`/api/v1/admin/founding-creators/${TEST_UUID}/decision`)
      .set(ADMIN_BEARER)
      .send({ approve: true })
      .expect(403);
    expect(review.queue).not.toHaveBeenCalled();
    expect(review.decide).not.toHaveBeenCalled();
  });

  it('needs a staff session: an account session is not one', async () => {
    await request(allowed.getHttpServer())
      .get('/api/v1/admin/founding-creators')
      .expect(401);
    await request(allowed.getHttpServer())
      .get('/api/v1/admin/founding-creators')
      .set(BEARER)
      .expect(401);
  });

  it('lists the queue', async () => {
    await request(allowed.getHttpServer())
      .get('/api/v1/admin/founding-creators')
      .set(ADMIN_BEARER)
      .expect(200, { items: [], total: 0 });
  });

  it('takes a decision by the member of staff, and refuses a decline without a known reason', async () => {
    const server = allowed.getHttpServer();
    await request(server)
      .post(`/api/v1/admin/founding-creators/${TEST_UUID}/decision`)
      .set(ADMIN_BEARER)
      .send({ approve: false, reason: 'OUTSIDE_LAUNCH_AREA', note: ' x ' })
      .expect(200);
    expect(review.decide).toHaveBeenCalledWith(TEST_ADMIN.adminId, TEST_UUID, {
      approve: false,
      reason: 'OUTSIDE_LAUNCH_AREA',
      note: 'x',
    });
    await request(server)
      .post(`/api/v1/admin/founding-creators/${TEST_UUID}/decision`)
      .set(ADMIN_BEARER)
      .send({ approve: false, reason: 'BAD' })
      .expect(400);
    await request(server)
      .post(`/api/v1/admin/founding-creators/${TEST_UUID}/decision`)
      .set(ADMIN_BEARER)
      .send({ approve: false, reason: 'OTHER', note: 'n'.repeat(501) })
      .expect(400);
    await request(server)
      .post('/api/v1/admin/founding-creators/nope/decision')
      .set(ADMIN_BEARER)
      .send({ approve: true })
      .expect(400);
    await request(server)
      .post(`/api/v1/admin/founding-creators/${TEST_UUID}/decision`)
      .set(ADMIN_BEARER)
      .send({ approve: true })
      .expect(200);
    expect(review.decide).toHaveBeenCalledTimes(2);
  });
});
