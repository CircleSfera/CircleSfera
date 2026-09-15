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
import { PlacesController } from './places.controller.js';
import { PlacesService } from './places.service.js';

describe('PlacesController', () => {
  let app: INestApplication;

  const mockService = {
    getMapPins: vi.fn(),
    findOne: vi.fn(),
    getPlacePosts: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [PlacesController],
      providers: [{ provide: PlacesService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects map without a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/places/map')
      .query({
        minLat: 40,
        maxLat: 41,
        minLng: -4,
        maxLng: -3,
        limit: 20,
      })
      .expect(401);

    expect(mockService.getMapPins).not.toHaveBeenCalled();
  });

  it('getMap passes bbox and session profileId', async () => {
    mockService.getMapPins.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/places/map')
      .query({
        minLat: 40,
        maxLat: 41,
        minLng: -4,
        maxLng: -3,
        limit: 20,
      })
      .set(BEARER)
      .expect(200);

    expect(mockService.getMapPins).toHaveBeenCalledWith(
      expect.objectContaining({
        minLat: 40,
        maxLat: 41,
        minLng: -4,
        maxLng: -3,
        limit: 20,
      }),
      TEST_USER.profileId,
    );
  });

  it('findOne and getPosts pass id and session profileId', async () => {
    mockService.findOne.mockResolvedValue({
      id: 'place-1',
      postCount: 2,
    });
    mockService.getPlacePosts.mockResolvedValue({ data: [], meta: {} });

    await request(app.getHttpServer())
      .get('/api/v1/places/place-1')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/places/place-1/posts')
      .query({ page: 1, limit: 20 })
      .set(BEARER)
      .expect(200);

    expect(mockService.findOne).toHaveBeenCalledWith(
      'place-1',
      TEST_USER.profileId,
    );
    expect(mockService.getPlacePosts).toHaveBeenCalledWith(
      'place-1',
      expect.objectContaining({ page: 1, limit: 20 }),
      TEST_USER.profileId,
    );
  });
});
