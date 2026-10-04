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
import { AdminRiskCasesController } from './admin-risk-cases.controller.js';
import { AdminRiskCasesService } from './admin-risk-cases.service.js';

describe('AdminRiskCasesController', () => {
  let app: INestApplication;
  const mockService = {
    list: vi.fn(),
    stats: vi.fn(),
    resolve: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminRiskCasesController],
      providers: [{ provide: AdminRiskCasesService, useValue: mockService }],
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
      .get('/api/v1/admin/risk-cases')
      .set(BEARER)
      .expect(401);
    expect(mockService.list).not.toHaveBeenCalled();
  });

  it('lists open cases by default and ignores an unknown status', async () => {
    mockService.list.mockResolvedValue({ data: [], meta: {} });

    await request(app.getHttpServer())
      .get('/api/v1/admin/risk-cases?status=WHATEVER&page=2&limit=5')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.list).toHaveBeenCalledWith('OPEN', 2, 5);
  });

  it('returns the detector stats', async () => {
    mockService.stats.mockResolvedValue({ precision: 0.5 });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/risk-cases/stats')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(res.body).toEqual({ precision: 0.5 });
  });

  it('resolves a case as the staff member', async () => {
    mockService.resolve.mockResolvedValue({ id: 'case-1' });

    await request(app.getHttpServer())
      .post('/api/v1/admin/risk-cases/case-1/resolve')
      .set(ADMIN_BEARER)
      .send({ decision: 'RESTRICTED', note: 'mass following' })
      .expect(201);

    expect(mockService.resolve).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'case-1',
      'RESTRICTED',
      'mass following',
    );
  });

  it('rejects an unknown decision', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/risk-cases/case-1/resolve')
      .set(ADMIN_BEARER)
      .send({ decision: 'DELETE_EVERYTHING' })
      .expect(400);
    expect(mockService.resolve).not.toHaveBeenCalled();
  });
});
