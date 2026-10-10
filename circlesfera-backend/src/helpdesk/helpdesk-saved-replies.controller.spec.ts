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
import { HelpdeskSavedRepliesController } from './helpdesk-saved-replies.controller.js';
import { HelpdeskSavedRepliesService } from './helpdesk-saved-replies.service.js';

describe('HelpdeskSavedRepliesController', () => {
  let app: INestApplication;
  const service = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  // Who is signed in in these tests holds every permission.
  const actor = { ref: TEST_ADMIN.adminId, canManage: true };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [HelpdeskSavedRepliesController],
      providers: [{ provide: HelpdeskSavedRepliesService, useValue: service }],
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
  });

  it('is behind the staff session and the support permission', async () => {
    expect(
      new Reflector().get(
        STAFF_PERMISSIONS_KEY,
        HelpdeskSavedRepliesController,
      ),
    ).toEqual(['support']);

    await request(app.getHttpServer())
      .get('/api/v1/admin/support/saved-replies')
      .set(BEARER)
      .expect(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('lists for who is signed in', async () => {
    service.list.mockResolvedValue([{ id: 'r-1' }]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/support/saved-replies')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(res.body).toEqual([{ id: 'r-1' }]);
    expect(service.list).toHaveBeenCalledWith(TEST_ADMIN.adminId);
  });

  it('creates, changes and deletes as who is signed in, who leads or not as their identity says', async () => {
    service.create.mockResolvedValue({ id: 'r-1' });
    service.update.mockResolvedValue({ id: 'r-1' });
    service.remove.mockResolvedValue({ deleted: true });

    await request(app.getHttpServer())
      .post('/api/v1/admin/support/saved-replies')
      .set(ADMIN_BEARER)
      .send({ title: 'Refund', body: 'Hello', shared: true })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/support/saved-replies/r-1')
      .set(ADMIN_BEARER)
      .send({ title: 'Refunds' })
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/admin/support/saved-replies/r-1')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(service.create).toHaveBeenCalledWith(actor, {
      title: 'Refund',
      body: 'Hello',
      shared: true,
    });
    expect(service.update).toHaveBeenCalledWith(actor, 'r-1', {
      title: 'Refunds',
    });
    expect(service.remove).toHaveBeenCalledWith(actor, 'r-1');
  });

  it.each([
    ['no title', { body: 'Hello' }],
    ['no text', { title: 'Refund' }],
    ['a title over 120 characters', { title: 'x'.repeat(121), body: 'Hello' }],
    [
      'a text over 5000 characters',
      { title: 'Refund', body: 'x'.repeat(5001) },
    ],
    ['who owns it', { title: 'Refund', body: 'Hello', ownerRef: 'admin-2' }],
    ['shared as a word', { title: 'Refund', body: 'Hello', shared: 'yes' }],
  ])('rejects a reply with %s', async (_case, body) => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/support/saved-replies')
      .set(ADMIN_BEARER)
      .send(body)
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('does not let a change say whose the reply is or share it', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/support/saved-replies/r-1')
      .set(ADMIN_BEARER)
      .send({ title: 'Refunds', shared: true })
      .expect(400);
    expect(service.update).not.toHaveBeenCalled();
  });
});
