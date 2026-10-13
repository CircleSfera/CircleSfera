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
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
} from '../common/testing/http-controller.js';
import { AdminProfileSuspensionController } from './admin-profile-suspension.controller.js';
import { AdminProfileSuspensionService } from './admin-profile-suspension.service.js';

describe('AdminProfileSuspensionController', () => {
  let app: INestApplication;
  const mockService = { suspend: vi.fn(), lift: vi.fn() };
  const body = {
    cause: 'SCAM',
    days: 7,
    note: 'Asked followers for money for a prize that does not exist.',
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminProfileSuspensionController],
      providers: [
        { provide: AdminProfileSuspensionService, useValue: mockService },
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
  });

  it('rejects a participant session', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/profiles/p-1/suspend')
      .set(BEARER)
      .send(body)
      .expect(401);
    expect(mockService.suspend).not.toHaveBeenCalled();
  });

  it('suspends the Profile named, as the staff member signed in', async () => {
    mockService.suspend.mockResolvedValue({ success: true });

    await request(app.getHttpServer())
      .patch('/api/v1/admin/profiles/p-1/suspend')
      .set(ADMIN_BEARER)
      .send(body)
      .expect(200);

    expect(mockService.suspend).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'p-1',
      body,
    );
  });

  it.each([
    ['a cause outside the list', { cause: 'OTHER' }],
    ['spam, which has its own path', { cause: 'SPAM' }],
    ['no cause', { cause: undefined }],
    ['no days', { days: 0 }],
    ['more than thirty days', { days: 31 }],
    ['a part of a day', { days: 1.5 }],
    ['nothing written about what was seen', { note: '' }],
    ['a note of a few letters', { note: 'bad' }],
  ])('refuses a suspension with %s', async (_what, change) => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/profiles/p-1/suspend')
      .set(ADMIN_BEARER)
      .send({ ...body, ...change })
      .expect(400);
    expect(mockService.suspend).not.toHaveBeenCalled();
  });

  it('lifts the suspension of the Profile named', async () => {
    mockService.lift.mockResolvedValue({ success: true });

    await request(app.getHttpServer())
      .patch('/api/v1/admin/profiles/p-1/lift-suspension')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.lift).toHaveBeenCalledWith(TEST_ADMIN.adminId, 'p-1');
  });
});
