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
import { ProfileStrikesController } from './profile-strikes.controller.js';
import { ProfileStrikesService } from './profile-strikes.service.js';

describe('ProfileStrikesController', () => {
  let app: INestApplication;
  const mockService = { listForProfile: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [ProfileStrikesController],
      providers: [{ provide: ProfileStrikesService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/strikes/me').expect(401);
    expect(mockService.listForProfile).not.toHaveBeenCalled();
  });

  it('lists the strikes of the Profile the session acts as', async () => {
    mockService.listForProfile.mockResolvedValue([{ id: 'strike-1' }]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/strikes/me')
      .set(BEARER)
      .expect(200);

    expect(mockService.listForProfile).toHaveBeenCalledWith(
      TEST_USER.profileId,
    );
    expect(res.body).toEqual([{ id: 'strike-1' }]);
  });
});
