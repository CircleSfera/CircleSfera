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
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';

describe('CollectionsController', () => {
  let app: INestApplication;

  const mockService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [CollectionsController],
      providers: [{ provide: CollectionsService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects create without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/collections')
      .send({ name: 'Saved' })
      .expect(401);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/collections')
      .set(BEARER)
      .send({ name: 'Saved', ownerId: 'attacker' })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('creates a collection for the session profile', async () => {
    mockService.create.mockResolvedValue({ id: 'col-1', name: 'Saved' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/collections')
      .set(BEARER)
      .send({ name: 'Saved', description: 'Inbox' })
      .expect(201);

    expect(res.body).toEqual({ id: 'col-1', name: 'Saved' });
    expect(mockService.create).toHaveBeenCalledWith(TEST_USER.profileId, {
      name: 'Saved',
      description: 'Inbox',
    });
  });

  it('lists collections for the session profile', async () => {
    mockService.findAll.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/collections')
      .set(BEARER)
      .expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith(TEST_USER.profileId);
  });

  it('loads a collection scoped to the session profile', async () => {
    mockService.findOne.mockResolvedValue({ id: 'col-1' });

    await request(app.getHttpServer())
      .get('/api/v1/collections/col-1')
      .set(BEARER)
      .expect(200);

    expect(mockService.findOne).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'col-1',
    );
  });

  it('renames a collection scoped to the session profile', async () => {
    mockService.update.mockResolvedValue({ id: 'col-1', name: 'Later' });

    await request(app.getHttpServer())
      .patch('/api/v1/collections/col-1')
      .set(BEARER)
      .send({ name: 'Later' })
      .expect(200);

    expect(mockService.update).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'col-1',
      { name: 'Later' },
    );
  });

  it('deletes a collection scoped to the session profile', async () => {
    mockService.delete.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .delete('/api/v1/collections/col-1')
      .set(BEARER)
      .expect(200);

    expect(mockService.delete).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'col-1',
    );
  });
});
