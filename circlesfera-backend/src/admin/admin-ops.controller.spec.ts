import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentAdminData } from '../auth/decorators/current-admin.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminOpsController } from './admin-ops.controller.js';
import { AdminOpsService } from './admin-ops.service.js';

describe('AdminOpsController', () => {
  let controller: AdminOpsController;

  const admin: CurrentAdminData = {
    adminId: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Staff',
    permissions: ['moderation', 'experiments', 'support', 'payments'],
    roles: ['ADMIN'],
    userId: 'admin-1',
  };

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminOpsController],
      providers: [{ provide: AdminOpsService, useValue: mockService }],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminOpsController>(AdminOpsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists firewall signatures and mutates them as adminId', async () => {
    mockService.getFirewallSignatures.mockResolvedValue({ data: [] });
    mockService.addFirewallSignature.mockResolvedValue({ id: 'fw-1' });
    mockService.deleteFirewallSignature.mockResolvedValue({ ok: true });

    await controller.getFirewallSignatures({});
    await controller.addFirewallSignature(
      { text: 'spam', category: 'SCAM' },
      admin,
    );
    await controller.deleteFirewallSignature('fw-1', admin);

    expect(mockService.getFirewallSignatures).toHaveBeenCalledWith(1, 20);
    expect(mockService.addFirewallSignature).toHaveBeenCalledWith(
      'admin-1',
      'spam',
      'SCAM',
    );
    expect(mockService.deleteFirewallSignature).toHaveBeenCalledWith(
      'admin-1',
      'fw-1',
    );
  });

  it('lists and assigns experiments as adminId', async () => {
    mockService.getUserExperiments.mockResolvedValue({ data: [] });
    mockService.assignUserExperiment.mockResolvedValue({ id: 'exp-1' });
    mockService.removeUserExperiment.mockResolvedValue({ ok: true });

    await controller.getUserExperiments({ search: 'ada' });
    await controller.assignUserExperiment(
      { userId: 'user-2', experimentKey: 'feed_v2', variant: 'B' },
      admin,
    );
    await controller.removeUserExperiment('exp-1', admin);

    expect(mockService.getUserExperiments).toHaveBeenCalledWith(1, 20, 'ada');
    expect(mockService.assignUserExperiment).toHaveBeenCalledWith(
      'admin-1',
      'user-2',
      'feed_v2',
      'B',
    );
    expect(mockService.removeUserExperiment).toHaveBeenCalledWith(
      'admin-1',
      'exp-1',
    );
  });

  it('lists and updates support tickets as adminId', async () => {
    const body = { status: 'RESOLVED' as const, reply: 'Done' };
    mockService.getSupportTickets.mockResolvedValue({ data: [] });
    mockService.updateSupportTicket.mockResolvedValue({ id: 't-1' });

    await controller.getSupportTickets({ status: 'OPEN' });
    await controller.updateSupportTicket('t-1', body, admin);

    expect(mockService.getSupportTickets).toHaveBeenCalledWith(1, 20, 'OPEN');
    expect(mockService.updateSupportTicket).toHaveBeenCalledWith(
      'admin-1',
      't-1',
      body,
    );
  });

  it('lists feature flags and upserts or deletes as adminId', async () => {
    mockService.listFeatureFlags.mockResolvedValue([]);
    mockService.upsertFeatureFlag.mockResolvedValue({ key: 'x' });
    mockService.deleteFeatureFlag.mockResolvedValue({ ok: true });

    await controller.listFeatureFlags();
    await controller.upsertFeatureFlag(
      'feed_v2',
      { name: 'Feed v2', isEnabled: true, percentage: 10 },
      admin,
    );
    await controller.deleteFeatureFlag('feed_v2', admin);

    expect(mockService.listFeatureFlags).toHaveBeenCalledWith();
    expect(mockService.upsertFeatureFlag).toHaveBeenCalledWith('admin-1', {
      key: 'feed_v2',
      name: 'Feed v2',
      isEnabled: true,
      percentage: 10,
    });
    expect(mockService.deleteFeatureFlag).toHaveBeenCalledWith(
      'admin-1',
      'feed_v2',
    );
  });

  it('reads webhooks without an actor and replays as adminId', async () => {
    mockService.getWebhookEvents.mockResolvedValue({ data: [] });
    mockService.getWebhookEvent.mockResolvedValue({ id: 'wh-1' });
    mockService.replayWebhookEvent.mockResolvedValue({ ok: true });

    await controller.getWebhookEvents({ status: 'FAILED' });
    await controller.getWebhookEvent('wh-1');
    await controller.replayWebhookEvent('wh-1', admin);

    expect(mockService.getWebhookEvents).toHaveBeenCalledWith(1, 20, 'FAILED');
    expect(mockService.getWebhookEvent).toHaveBeenCalledWith('wh-1');
    expect(mockService.replayWebhookEvent).toHaveBeenCalledWith(
      'admin-1',
      'wh-1',
    );
  });
});
