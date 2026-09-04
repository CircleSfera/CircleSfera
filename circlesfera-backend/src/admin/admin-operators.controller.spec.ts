import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentAdminData } from '../auth/decorators/current-admin.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminOperatorsController } from './admin-operators.controller.js';
import { AdminOperatorsService } from './admin-operators.service.js';

describe('AdminOperatorsController', () => {
  let controller: AdminOperatorsController;

  const admin: CurrentAdminData = {
    adminId: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Staff',
    permissions: ['admins.manage'],
    roles: ['SUPER_ADMIN'],
    userId: 'admin-1',
  };

  const mockService = {
    listRoles: vi.fn(),
    listOperators: vi.fn(),
    getOperator: vi.fn(),
    createOperator: vi.fn(),
    updateStatus: vi.fn(),
    replaceRoles: vi.fn(),
    resetMfa: vi.fn(),
    resetPassword: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminOperatorsController],
      providers: [{ provide: AdminOperatorsService, useValue: mockService }],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminOperatorsController>(AdminOperatorsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists roles without an actor', async () => {
    mockService.listRoles.mockResolvedValue([]);

    await controller.listRoles();

    expect(mockService.listRoles).toHaveBeenCalledWith();
  });

  it('lists operators with default and parsed pagination', async () => {
    mockService.listOperators.mockResolvedValue({ data: [] });

    await controller.list({});
    await controller.list({
      page: '2',
      limit: '10',
      search: 'ada',
      status: 'ACTIVE',
    });

    expect(mockService.listOperators).toHaveBeenNthCalledWith(
      1,
      1,
      20,
      undefined,
      undefined,
    );
    expect(mockService.listOperators).toHaveBeenNthCalledWith(
      2,
      2,
      10,
      'ada',
      'ACTIVE',
    );
  });

  it('loads one operator by id', async () => {
    mockService.getOperator.mockResolvedValue({ id: 'op-1' });

    await controller.getOne('op-1');

    expect(mockService.getOperator).toHaveBeenCalledWith('op-1');
  });

  it('creates an operator as adminId', async () => {
    const dto = {
      email: 'new@example.com',
      password: 'password1234',
      displayName: 'New Op',
      roleIds: ['role-1'],
    };
    mockService.createOperator.mockResolvedValue({ id: 'op-2' });

    await controller.create(admin, dto);

    expect(mockService.createOperator).toHaveBeenCalledWith('admin-1', dto);
  });

  it('updates status and roles as adminId and unwraps the body', async () => {
    mockService.updateStatus.mockResolvedValue({ id: 'op-1' });
    mockService.replaceRoles.mockResolvedValue({ id: 'op-1' });

    await controller.updateStatus(admin, 'op-1', { status: 'DISABLED' });
    await controller.replaceRoles(admin, 'op-1', { roleIds: ['role-2'] });

    expect(mockService.updateStatus).toHaveBeenCalledWith(
      'admin-1',
      'op-1',
      'DISABLED',
    );
    expect(mockService.replaceRoles).toHaveBeenCalledWith('admin-1', 'op-1', [
      'role-2',
    ]);
  });

  it('resets MFA and password as adminId', async () => {
    mockService.resetMfa.mockResolvedValue({ ok: true });
    mockService.resetPassword.mockResolvedValue({ ok: true });

    await controller.resetMfa(admin, 'op-1');
    await controller.resetPassword(admin, 'op-1', {
      password: 'password1234',
    });

    expect(mockService.resetMfa).toHaveBeenCalledWith('admin-1', 'op-1');
    expect(mockService.resetPassword).toHaveBeenCalledWith(
      'admin-1',
      'op-1',
      'password1234',
    );
  });
});
