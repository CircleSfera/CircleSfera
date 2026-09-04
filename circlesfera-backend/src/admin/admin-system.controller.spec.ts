import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentAdminData } from '../auth/decorators/current-admin.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminService } from './admin.service.js';
import { AdminSystemController } from './admin-system.controller.js';

describe('AdminSystemController', () => {
  let controller: AdminSystemController;

  const admin: CurrentAdminData = {
    adminId: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Staff',
    permissions: ['system', 'moderation', 'users.read'],
    roles: ['ADMIN'],
    userId: 'admin-1',
  };

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSystemController],
      providers: [{ provide: AdminService, useValue: mockService }],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminSystemController>(AdminSystemController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('reads stats, health and settings without an actor', async () => {
    mockService.getStats.mockResolvedValue({});
    mockService.getSystemHealth.mockResolvedValue({});
    mockService.getSystemSettings.mockResolvedValue([]);

    await controller.getStats();
    await controller.getSystemHealth();
    await controller.getSystemSettings();

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

    await controller.getFirewallRules({ search: 'spam' });
    await controller.addFirewallRule(createBody, admin);
    await controller.updateFirewallRule('rule-1', updateBody, admin);
    await controller.deleteFirewallRule('rule-1', admin);

    expect(mockService.getFirewallRules).toHaveBeenCalledWith(1, 20, 'spam');
    expect(mockService.createFirewallRule).toHaveBeenCalledWith(
      'admin-1',
      createBody,
    );
    expect(mockService.updateFirewallRule).toHaveBeenCalledWith(
      'admin-1',
      'rule-1',
      updateBody,
    );
    expect(mockService.deleteFirewallRule).toHaveBeenCalledWith(
      'admin-1',
      'rule-1',
    );
  });

  it('updates system settings as adminId and unwraps updates', async () => {
    const updates = [{ key: 'maintenance', value: 'false' }];
    mockService.updateSystemSettings.mockResolvedValue({ ok: true });

    await controller.updateSystemSettings({ updates }, admin);

    expect(mockService.updateSystemSettings).toHaveBeenCalledWith(
      'admin-1',
      updates,
    );
  });
});
