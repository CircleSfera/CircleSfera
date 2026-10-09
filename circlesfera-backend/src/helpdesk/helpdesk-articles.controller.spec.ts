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
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
} from '../common/testing/http-controller.js';
import { HelpdeskArticlesController } from './helpdesk-articles.controller.js';
import { HelpdeskArticlesService } from './helpdesk-articles.service.js';

describe('HelpdeskArticlesController', () => {
  let app: INestApplication;
  const service = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    takeBack: vi.fn(),
    remove: vi.fn(),
  };
  const base = '/api/v1/admin/support/articles';
  const valid = {
    slug: 'how-refunds-work',
    topic: 'PAYMENTS',
    texts: [{ locale: 'es', title: 'Reembolsos', body: 'Texto' }],
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [HelpdeskArticlesController],
      providers: [{ provide: HelpdeskArticlesService, useValue: service }],
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
    for (const call of Object.values(service))
      call.mockResolvedValue({ id: 'a-1' });
  });

  it('is behind the staff session and the permission of who leads support', async () => {
    expect(
      new Reflector().get(STAFF_PERMISSIONS_KEY, HelpdeskArticlesController),
    ).toEqual(['support.manage']);

    await request(app.getHttpServer()).get(base).set(BEARER).expect(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('lists, reads, creates, changes, publishes, takes back and deletes as who is signed in', async () => {
    const server = app.getHttpServer();
    await request(server).get(base).set(ADMIN_BEARER).expect(200);
    await request(server).get(`${base}/a-1`).set(ADMIN_BEARER).expect(200);
    await request(server).post(base).set(ADMIN_BEARER).send(valid).expect(201);
    await request(server)
      .patch(`${base}/a-1`)
      .set(ADMIN_BEARER)
      .send({ position: 3 })
      .expect(200);
    await request(server)
      .post(`${base}/a-1/publish`)
      .set(ADMIN_BEARER)
      .expect(200);
    await request(server)
      .post(`${base}/a-1/take-back`)
      .set(ADMIN_BEARER)
      .expect(200);
    await request(server).delete(`${base}/a-1`).set(ADMIN_BEARER).expect(200);

    expect(service.create).toHaveBeenCalledWith(TEST_ADMIN.adminId, valid);
    expect(service.update).toHaveBeenCalledWith('a-1', { position: 3 });
    expect(service.publish).toHaveBeenCalledWith(TEST_ADMIN.adminId, 'a-1');
    expect(service.takeBack).toHaveBeenCalledWith(TEST_ADMIN.adminId, 'a-1');
    expect(service.remove).toHaveBeenCalledWith(TEST_ADMIN.adminId, 'a-1');
  });

  it.each([
    ['an address with capitals or spaces', { ...valid, slug: 'How Refunds' }],
    ['an address that starts with a hyphen', { ...valid, slug: '-refunds' }],
    ['a topic that does not exist', { ...valid, topic: 'BILLING' }],
    ['no texts', { slug: 'x', topic: 'OTHER' }],
    [
      'a title over 150 characters',
      {
        ...valid,
        texts: [{ locale: 'es', title: 'x'.repeat(151), body: 'y' }],
      },
    ],
    [
      'a text over 20 000 characters',
      {
        ...valid,
        texts: [{ locale: 'es', title: 'x', body: 'y'.repeat(20001) }],
      },
    ],
    [
      'a language that is not one',
      { ...valid, texts: [{ locale: 'spanish', title: 'x', body: 'y' }] },
    ],
    ['a state', { ...valid, status: 'PUBLISHED' }],
    ['an organization', { ...valid, organizationId: 'other' }],
    [
      'a field inside a text',
      {
        ...valid,
        texts: [{ locale: 'es', title: 'x', body: 'y', html: '<b>' }],
      },
    ],
  ])('rejects a new article with %s', async (_case, body) => {
    await request(app.getHttpServer())
      .post(base)
      .set(ADMIN_BEARER)
      .send(body)
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('does not let a change move the address, the state or the counts', async () => {
    for (const body of [
      { slug: 'another' },
      { status: 'PUBLISHED' },
      { usefulYes: 99 },
    ]) {
      await request(app.getHttpServer())
        .patch(`${base}/a-1`)
        .set(ADMIN_BEARER)
        .send(body)
        .expect(400);
    }
    expect(service.update).not.toHaveBeenCalled();
  });
});
