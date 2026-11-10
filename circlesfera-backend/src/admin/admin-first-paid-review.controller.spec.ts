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
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
} from '../common/testing/http-controller.js';
import { AdminFirstPaidReviewController } from './admin-first-paid-review.controller.js';
import { AdminFirstPaidReviewService } from './admin-first-paid-review.service.js';

const ID = '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d';

describe('AdminFirstPaidReviewController', () => {
  let app: INestApplication;
  const service = { list: vi.fn(), approve: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminFirstPaidReviewController],
      providers: [{ provide: AdminFirstPaidReviewService, useValue: service }],
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

  it('is for staff with the moderation permission only', () => {
    for (const handler of [
      AdminFirstPaidReviewController.prototype.list,
      AdminFirstPaidReviewController.prototype.approve,
    ]) {
      expect(Reflect.getMetadata(STAFF_PERMISSIONS_KEY, handler)).toEqual([
        'moderation',
      ]);
    }
  });

  it('refuses a user session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/moderation/first-paid')
      .set(BEARER)
      .expect(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('lists what waits for a person', async () => {
    service.list.mockResolvedValue({ items: [], needed: 3 });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/moderation/first-paid')
      .set(ADMIN_BEARER)
      .expect(200);
    expect(res.body).toEqual({ items: [], needed: 3 });
  });

  it('passes an item as the staff member signed in', async () => {
    service.approve.mockResolvedValue({ approved: true });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/moderation/first-paid/STORY/${ID}/approve`)
      .set(ADMIN_BEARER)
      .expect(200);
    expect(service.approve).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'STORY',
      ID,
    );
  });

  it.each([
    ['a comment', `COMMENT/${ID}`],
    ['an id that is not one', 'POST/not-an-id'],
  ])('refuses %s', async (_case, path) => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/moderation/first-paid/${path}/approve`)
      .set(ADMIN_BEARER)
      .expect(400);
    expect(service.approve).not.toHaveBeenCalled();
  });
});
