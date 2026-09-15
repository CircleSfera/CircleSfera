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
import { AdminOpsController } from './admin-ops.controller.js';
import { AdminOpsService } from './admin-ops.service.js';

describe('AdminOpsController', () => {
  let app: INestApplication;

  const mockService = {
    getFirewallSignatures: vi.fn(),
    addFirewallSignature: vi.fn(),
    deleteFirewallSignature: vi.fn(),
    getUserExperiments: vi.fn(),
    assignUserExperiment: vi.fn(),
    removeUserExperiment: vi.fn(),
    getSupportTickets: vi.fn(),
    updateSupportTicket: vi.fn(),
    listFeatureFlags: vi.fn(),
    upsertFeatureFlag: vi.fn(),
    deleteFeatureFlag: vi.fn(),
    getWebhookEvents: vi.fn(),
    getWebhookEvent: vi.fn(),
    replayWebhookEvent: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminOpsController],
      providers: [{ provide: AdminOpsService, useValue: mockService }],
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

  it('rejects firewall list without credentials', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/firewall')
      .expect(401);

    expect(mockService.getFirewallSignatures).not.toHaveBeenCalled();
  });

  it('rejects firewall list with a user session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/firewall')
      .set(BEARER)
      .expect(401);

    expect(mockService.getFirewallSignatures).not.toHaveBeenCalled();
  });

  it('lists firewall signatures and mutates them as adminId', async () => {
    mockService.getFirewallSignatures.mockResolvedValue({ data: [] });
    mockService.addFirewallSignature.mockResolvedValue({ id: 'fw-1' });
    mockService.deleteFirewallSignature.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .get('/api/v1/admin/firewall')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/admin/firewall')
      .set(ADMIN_BEARER)
      .send({ text: 'spam', category: 'SCAM' })
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/admin/firewall/fw-1')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getFirewallSignatures).toHaveBeenCalledWith(1, 10);
    expect(mockService.addFirewallSignature).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'spam',
      'SCAM',
    );
    expect(mockService.deleteFirewallSignature).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'fw-1',
    );
  });

  it('lists and assigns experiments as adminId', async () => {
    mockService.getUserExperiments.mockResolvedValue({ data: [] });
    mockService.assignUserExperiment.mockResolvedValue({ id: 'exp-1' });
    mockService.removeUserExperiment.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .get('/api/v1/admin/experiments/users')
      .query({ search: 'ada' })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/admin/experiments/users')
      .set(ADMIN_BEARER)
      .send({
        userId: 'user-2',
        experimentKey: 'feed_v2',
        variant: 'B',
      })
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/admin/experiments/users/exp-1')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getUserExperiments).toHaveBeenCalledWith(1, 10, 'ada');
    expect(mockService.assignUserExperiment).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'user-2',
      'feed_v2',
      'B',
    );
    expect(mockService.removeUserExperiment).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'exp-1',
    );
  });

  it('lists and updates support tickets as adminId', async () => {
    const body = { status: 'RESOLVED' as const, reply: 'Done' };
    mockService.getSupportTickets.mockResolvedValue({ data: [] });
    mockService.updateSupportTicket.mockResolvedValue({ id: 't-1' });

    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets')
      .query({ status: 'OPEN' })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/support/tickets/t-1')
      .set(ADMIN_BEARER)
      .send(body)
      .expect(200);

    expect(mockService.getSupportTickets).toHaveBeenCalledWith(1, 10, 'OPEN');
    expect(mockService.updateSupportTicket).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      't-1',
      body,
    );
  });

  it('lists feature flags and upserts or deletes as adminId', async () => {
    mockService.listFeatureFlags.mockResolvedValue([]);
    mockService.upsertFeatureFlag.mockResolvedValue({ key: 'x' });
    mockService.deleteFeatureFlag.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .get('/api/v1/admin/feature-flags')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .put('/api/v1/admin/feature-flags/feed_v2')
      .set(ADMIN_BEARER)
      .send({ name: 'Feed v2', isEnabled: true, percentage: 10 })
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/admin/feature-flags/feed_v2')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.listFeatureFlags).toHaveBeenCalledWith();
    expect(mockService.upsertFeatureFlag).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      {
        key: 'feed_v2',
        name: 'Feed v2',
        isEnabled: true,
        percentage: 10,
      },
    );
    expect(mockService.deleteFeatureFlag).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'feed_v2',
    );
  });

  it('reads webhooks without an actor and replays as adminId', async () => {
    mockService.getWebhookEvents.mockResolvedValue({ data: [] });
    mockService.getWebhookEvent.mockResolvedValue({ id: 'wh-1' });
    mockService.replayWebhookEvent.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .get('/api/v1/admin/webhooks')
      .query({ status: 'FAILED' })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/webhooks/wh-1')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/admin/webhooks/wh-1/replay')
      .set(ADMIN_BEARER)
      .expect(201);

    expect(mockService.getWebhookEvents).toHaveBeenCalledWith(1, 10, 'FAILED');
    expect(mockService.getWebhookEvent).toHaveBeenCalledWith('wh-1');
    expect(mockService.replayWebhookEvent).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'wh-1',
    );
  });
});
