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
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { ExperimentsController } from './experiments.controller.js';
import { ExperimentsService } from './experiments.service.js';

describe('ExperimentsController', () => {
  let app: INestApplication;

  const mockService = {
    getMyFlags: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [ExperimentsController],
      providers: [{ provide: ExperimentsService, useValue: mockService }],
      guards: [{ guard: JwtOptionalGuard, mode: 'optional' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns flags for a guest without a session', async () => {
    mockService.getMyFlags.mockResolvedValue({ foo: false });

    const res = await request(app.getHttpServer())
      .get('/api/v1/experiments/my-flags')
      .expect(200);

    expect(res.body).toEqual({ foo: false });
    expect(mockService.getMyFlags).toHaveBeenCalledWith(null);
  });

  it('returns flags for the session userId', async () => {
    mockService.getMyFlags.mockResolvedValue({ foo: true });

    const res = await request(app.getHttpServer())
      .get('/api/v1/experiments/my-flags')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ foo: true });
    expect(mockService.getMyFlags).toHaveBeenCalledWith(TEST_USER.userId);
  });
});
