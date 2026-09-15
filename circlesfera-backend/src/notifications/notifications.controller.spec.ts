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
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsController', () => {
  let app: INestApplication;

  const mockService = {
    findAll: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects listing without a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications').expect(401);

    expect(mockService.findAll).not.toHaveBeenCalled();
  });

  it('lists notifications as the session profile', async () => {
    mockService.findAll.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .query({ page: 1, limit: 10 })
      .set(BEARER)
      .expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith(
      TEST_USER.profileId,
      expect.objectContaining({ page: 1, limit: 10 }),
    );
  });

  it('reads unread count as the session profile', async () => {
    mockService.getUnreadCount.mockResolvedValue({ count: 3 });

    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ count: 3 });
    expect(mockService.getUnreadCount).toHaveBeenCalledWith(
      TEST_USER.profileId,
    );
  });

  it('marks one notification read as the session profile', async () => {
    mockService.markAsRead.mockResolvedValue({ id: 'n-1' });

    await request(app.getHttpServer())
      .put('/api/v1/notifications/n-1/read')
      .set(BEARER)
      .expect(200);

    expect(mockService.markAsRead).toHaveBeenCalledWith(
      'n-1',
      TEST_USER.profileId,
    );
  });

  it('marks all notifications read as the session profile', async () => {
    mockService.markAllAsRead.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .put('/api/v1/notifications/read-all')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ success: true });
    expect(mockService.markAllAsRead).toHaveBeenCalledWith(TEST_USER.profileId);
  });
});
