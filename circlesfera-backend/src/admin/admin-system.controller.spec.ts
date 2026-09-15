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
import { AdminService } from './admin.service.js';
import { AdminSystemController } from './admin-system.controller.js';

describe('AdminSystemController', () => {
  let app: INestApplication;

  const mockService = {
    getStats: vi.fn(),
    getSystemHealth: vi.fn(),
    getFirewallRules: vi.fn(),
    createFirewallRule: vi.fn(),
    updateFirewallRule: vi.fn(),
    deleteFirewallRule: vi.fn(),
    getSystemSettings: vi.fn(),
    updateSystemSettings: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminSystemController],
      providers: [{ provide: AdminService, useValue: mockService }],
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

  it('rejects stats without credentials', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/stats').expect(401);

    expect(mockService.getStats).not.toHaveBeenCalled();
  });

  it('rejects stats with a user session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set(BEARER)
      .expect(401);

    expect(mockService.getStats).not.toHaveBeenCalled();
  });

  it('reads stats, health and settings without an actor', async () => {
    mockService.getStats.mockResolvedValue({});
    mockService.getSystemHealth.mockResolvedValue({});
    mockService.getSystemSettings.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/health')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/settings')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getStats).toHaveBeenCalledWith();
    expect(mockService.getSystemHealth).toHaveBeenCalledWith();
    expect(mockService.getSystemSettings).toHaveBeenCalledWith();
  });

  it('lists firewall rules and mutates them as adminId', async () => {
    const createBody = { keyword: 'spam', action: 'BLOCK', isActive: true };
    const updateBody = { isActive: false };
    mockService.getFirewallRules.mockResolvedValue({ data: [] });
    mockService.createFirewallRule.mockResolvedValue({ id: 'rule-1' });
    mockService.updateFirewallRule.mockResolvedValue({ id: 'rule-1' });
    mockService.deleteFirewallRule.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .get('/api/v1/admin/firewall/rules')
      .query({ search: 'spam' })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/admin/firewall/rules')
      .set(ADMIN_BEARER)
      .send(createBody)
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/firewall/rules/rule-1')
      .set(ADMIN_BEARER)
      .send(updateBody)
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/admin/firewall/rules/rule-1')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getFirewallRules).toHaveBeenCalledWith(1, 10, 'spam');
    expect(mockService.createFirewallRule).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      createBody,
    );
    expect(mockService.updateFirewallRule).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'rule-1',
      updateBody,
    );
    expect(mockService.deleteFirewallRule).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'rule-1',
    );
  });

  it('updates system settings as adminId and unwraps updates', async () => {
    const updates = [{ key: 'maintenance', value: 'false' }];
    mockService.updateSystemSettings.mockResolvedValue({ ok: true });

    const res = await request(app.getHttpServer())
      .patch('/api/v1/admin/settings')
      .set(ADMIN_BEARER)
      .send({ updates })
      .expect(200);

    expect(res.body).toEqual({ ok: true });
    expect(mockService.updateSystemSettings).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      updates,
    );
  });
});
