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
import { CollaborationsController } from './collaborations.controller.js';
import { PostCollaboratorsService } from './post-collaborators.service.js';

describe('CollaborationsController', () => {
  let app: INestApplication;
  const mockService = {
    invitations: vi.fn(),
    accept: vi.fn(),
    leave: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [CollaborationsController],
      providers: [{ provide: PostCollaboratorsService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['get', '/api/v1/collaborations/invitations'],
    ['post', '/api/v1/collaborations/post-1/accept'],
    ['delete', '/api/v1/collaborations/post-1'],
  ] as const)('rejects %s %s without a session', async (method, path) => {
    await request(app.getHttpServer())[method](path).expect(401);
    expect(mockService.invitations).not.toHaveBeenCalled();
    expect(mockService.accept).not.toHaveBeenCalled();
    expect(mockService.leave).not.toHaveBeenCalled();
  });

  it('answers for the signed-in Profile only', async () => {
    mockService.invitations.mockResolvedValue([]);
    mockService.accept.mockResolvedValue({ status: 'ACCEPTED' });
    mockService.leave.mockResolvedValue({ collaborator: null });

    await request(app.getHttpServer())
      .get('/api/v1/collaborations/invitations')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/collaborations/post-1/accept')
      .set(BEARER)
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/collaborations/post-1')
      .set(BEARER)
      .expect(200);

    expect(mockService.invitations).toHaveBeenCalledWith(TEST_USER.profileId);
    expect(mockService.accept).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'post-1',
    );
    expect(mockService.leave).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'post-1',
    );
  });
});
