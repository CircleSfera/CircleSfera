import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { AppealsController } from './appeals.controller.js';
import { AppealsService } from './appeals.service.js';

describe('AppealsController', () => {
  let app: INestApplication;

  const createDto = {
    targetType: 'ACCOUNT_BAN',
    reason: 'Please review this ban',
  };

  const mockService = {
    create: vi.fn(),
    findMyUserAppeals: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
  };

  const mockJwt = {
    verify: vi.fn(),
  };

  const mockConfig = {
    get: vi.fn().mockReturnValue('test-jwt-secret'),
    getOrThrow: vi.fn().mockReturnValue('test-jwt-secret'),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AppealsController],
      providers: [
        { provide: AppealsService, useValue: mockService },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: JwtOptionalGuard, mode: 'optional' },
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
    mockConfig.get.mockReturnValue('test-jwt-secret');
  });

  it('rejects my appeals without a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/appeals/my-appeals')
      .expect(401);

    expect(mockService.findMyUserAppeals).not.toHaveBeenCalled();
  });

  it('rejects create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/appeals')
      .set(BEARER)
      .send({ ...createDto, appealToken: 'token-2' })
      .expect(400);

    expect(mockJwt.verify).not.toHaveBeenCalled();
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('creates an appeal as the JWT userId when present', async () => {
    mockService.create.mockResolvedValue({ id: 'appeal-1' });

    await request(app.getHttpServer())
      .post('/api/v1/appeals')
      .set(BEARER)
      .send(createDto)
      .expect(201);

    expect(mockJwt.verify).not.toHaveBeenCalled();
    expect(mockService.create).toHaveBeenCalledWith(
      TEST_USER.userId,
      createDto,
    );
  });

  it('creates an appeal from an x-appeal-token payload', async () => {
    mockJwt.verify.mockReturnValue({ isAppealToken: true, sub: 'banned-1' });
    mockService.create.mockResolvedValue({ id: 'appeal-1' });

    await request(app.getHttpServer())
      .post('/api/v1/appeals')
      .set('x-appeal-token', 'token-1')
      .send(createDto)
      .expect(201);

    expect(mockJwt.verify).toHaveBeenCalledWith('token-1', {
      secret: 'test-jwt-secret',
    });
    expect(mockService.create).toHaveBeenCalledWith('banned-1', createDto);
  });

  it('rejects an invalid appeal token', async () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error('expired');
    });

    await request(app.getHttpServer())
      .post('/api/v1/appeals')
      .set('x-appeal-token', 'bad-token')
      .send(createDto)
      .expect(401);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects create without JWT user or appeal token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/appeals')
      .send(createDto)
      .expect(401);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('lists the caller appeals by userId', async () => {
    mockService.findMyUserAppeals.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/appeals/my-appeals')
      .set(BEARER)
      .expect(200);

    expect(mockService.findMyUserAppeals).toHaveBeenCalledWith(
      TEST_USER.userId,
    );
  });

  it('rejects the admin list with a user session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/appeals/admin')
      .set(BEARER)
      .expect(401);

    expect(mockService.findAll).not.toHaveBeenCalled();
  });

  it('lists admin appeals with default and parsed pagination', async () => {
    mockService.findAll.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/appeals/admin')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/appeals/admin')
      .query({ page: 2, limit: 10, status: 'PENDING' })
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.findAll).toHaveBeenNthCalledWith(1, 1, 20, undefined);
    expect(mockService.findAll).toHaveBeenNthCalledWith(2, 2, 10, 'PENDING');
  });

  it('updates an appeal as the staff adminId', async () => {
    const dto = { status: 'APPROVED' };
    mockService.update.mockResolvedValue({ id: 'appeal-1' });

    await request(app.getHttpServer())
      .patch('/api/v1/appeals/admin/appeal-1')
      .set(ADMIN_BEARER)
      .send(dto)
      .expect(200);

    expect(mockService.update).toHaveBeenCalledWith(
      'appeal-1',
      dto,
      TEST_ADMIN.adminId,
    );
  });
});
