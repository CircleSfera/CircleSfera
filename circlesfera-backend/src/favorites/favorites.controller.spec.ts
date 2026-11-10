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
import { FavoritesController } from './favorites.controller.js';
import { FavoritesService } from './favorites.service.js';

describe('FavoritesController', () => {
  let app: INestApplication;

  const mockService = {
    list: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [FavoritesController],
      providers: [{ provide: FavoritesService, useValue: mockService }],
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
    ['get', '/api/v1/favorites'],
    ['post', '/api/v1/favorites/fav-1'],
    ['delete', '/api/v1/favorites/fav-1'],
  ] as const)('rejects %s %s without a session', async (method, path) => {
    await request(app.getHttpServer())[method](path).expect(401);
    expect(mockService.list).not.toHaveBeenCalled();
    expect(mockService.add).not.toHaveBeenCalled();
    expect(mockService.remove).not.toHaveBeenCalled();
  });

  it('lists the viewer profile’s Favorites', async () => {
    mockService.list.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/v1/favorites')
      .set(BEARER)
      .expect(200);
    expect(mockService.list).toHaveBeenCalledWith(TEST_USER.profileId);
  });

  it('adds and removes for the viewer profile only', async () => {
    mockService.add.mockResolvedValue({
      favoriteId: 'fav-1',
      isFavorite: true,
    });
    mockService.remove.mockResolvedValue({
      favoriteId: 'fav-1',
      isFavorite: false,
    });

    await request(app.getHttpServer())
      .post('/api/v1/favorites/fav-1')
      .set(BEARER)
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/favorites/fav-1')
      .set(BEARER)
      .expect(200);

    expect(mockService.add).toHaveBeenCalledWith(TEST_USER.profileId, 'fav-1');
    expect(mockService.remove).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'fav-1',
    );
  });
});
