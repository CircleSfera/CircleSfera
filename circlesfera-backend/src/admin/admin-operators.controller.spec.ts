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
import { AdminOperatorsController } from './admin-operators.controller.js';
import { AdminOperatorsService } from './admin-operators.service.js';

describe('AdminOperatorsController', () => {
  let app: INestApplication;

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

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminOperatorsController],
      providers: [{ provide: AdminOperatorsService, useValue: mockService }],
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

  it('rejects roles list without credentials', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/operators/roles')
      .expect(401);

    expect(mockService.listRoles).not.toHaveBeenCalled();
  });

  it('rejects roles list with a user session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/operators/roles')
      .set(BEARER)
      .expect(401);

    expect(mockService.listRoles).not.toHaveBeenCalled();
  });

  it('rejects create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/operators')
      .set(ADMIN_BEARER)
      .send({
        email: 'new@example.com',
        password: 'password1234',
        displayName: 'New Op',
        roleIds: ['role-1'],
        extra: 'nope',
      })
      .expect(400);

    expect(mockService.createOperator).not.toHaveBeenCalled();
  });

  it('rejects status update with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/operators/op-1/status')
      .set(ADMIN_BEARER)
      .send({ status: 'DISABLED', extra: 'nope' })
      .expect(400);

    expect(mockService.updateStatus).not.toHaveBeenCalled();
  });

  it('rejects replace roles with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/admin/operators/op-1/roles')
      .set(ADMIN_BEARER)
      .send({ roleIds: ['role-2'], extra: 'nope' })
      .expect(400);

    expect(mockService.replaceRoles).not.toHaveBeenCalled();
  });

  it('rejects reset password with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/operators/op-1/reset-password')
      .set(ADMIN_BEARER)
      .send({ password: 'password1234', extra: 'nope' })
      .expect(400);

    expect(mockService.resetPassword).not.toHaveBeenCalled();
  });

  it('lists roles without an actor', async () => {
    mockService.listRoles.mockResolvedValue([]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/operators/roles')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(res.body).toEqual([]);
    expect(mockService.listRoles).toHaveBeenCalledWith();
  });

  it('lists operators with default and parsed pagination', async () => {
    mockService.listOperators.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/admin/operators')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/operators')
      .query({
        page: '2',
        limit: '10',
        search: 'ada',
        status: 'ACTIVE',
      })
      .set(ADMIN_BEARER)
      .expect(200);

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

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/operators/op-1')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(res.body).toEqual({ id: 'op-1' });
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

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/operators')
      .set(ADMIN_BEARER)
      .send(dto)
      .expect(201);

    expect(res.body).toEqual({ id: 'op-2' });
    expect(mockService.createOperator).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      dto,
    );
  });

  it('updates status and roles as adminId and unwraps the body', async () => {
    mockService.updateStatus.mockResolvedValue({ id: 'op-1' });
    mockService.replaceRoles.mockResolvedValue({ id: 'op-1' });

    await request(app.getHttpServer())
      .patch('/api/v1/admin/operators/op-1/status')
      .set(ADMIN_BEARER)
      .send({ status: 'DISABLED' })
      .expect(200);
    await request(app.getHttpServer())
      .put('/api/v1/admin/operators/op-1/roles')
      .set(ADMIN_BEARER)
      .send({ roleIds: ['role-2'] })
      .expect(200);

    expect(mockService.updateStatus).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'op-1',
      'DISABLED',
    );
    expect(mockService.replaceRoles).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'op-1',
      ['role-2'],
    );
  });

  it('resets MFA and password as adminId', async () => {
    mockService.resetMfa.mockResolvedValue({ ok: true });
    mockService.resetPassword.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .post('/api/v1/admin/operators/op-1/reset-mfa')
      .set(ADMIN_BEARER)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/admin/operators/op-1/reset-password')
      .set(ADMIN_BEARER)
      .send({ password: 'password1234' })
      .expect(201);

    expect(mockService.resetMfa).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'op-1',
    );
    expect(mockService.resetPassword).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'op-1',
      'password1234',
    );
  });
});
