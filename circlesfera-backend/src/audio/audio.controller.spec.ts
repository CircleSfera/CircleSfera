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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
} from '../common/testing/http-controller.js';
import { AudioController } from './audio.controller.js';
import { AudioService } from './audio.service.js';

describe('AudioController', () => {
  let app: INestApplication;

  const mockService = {
    create: vi.fn(),
    findAll: vi.fn(),
    search: vi.fn(),
    getTrending: vi.fn(),
    findOne: vi.fn(),
    getAudioPosts: vi.fn(),
  };

  const createDto = {
    title: 'Track',
    artist: 'Artist',
    url: 'https://cdn.example.com/a.mp3',
    duration: 120,
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AudioController],
      providers: [{ provide: AudioService, useValue: mockService }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
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

  it('rejects listing without a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/audio').expect(401);

    expect(mockService.findAll).not.toHaveBeenCalled();
  });

  it('rejects create with a user session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/audio')
      .set(BEARER)
      .send(createDto)
      .expect(401);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/audio')
      .set(ADMIN_BEARER)
      .send({ ...createDto, ownerId: 'attacker' })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('creates a track from the body without an actor id', async () => {
    mockService.create.mockResolvedValue({ id: 'audio-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/audio')
      .set(ADMIN_BEARER)
      .send(createDto)
      .expect(201);

    expect(res.body).toEqual({ id: 'audio-1' });
    expect(mockService.create).toHaveBeenCalledWith(createDto);
  });

  it('lists, searches and loads trending tracks', async () => {
    mockService.findAll.mockResolvedValue([]);
    mockService.search.mockResolvedValue([]);
    mockService.getTrending.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/audio')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/audio/search')
      .query({ q: 'jazz' })
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/audio/trending')
      .set(BEARER)
      .expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith();
    expect(mockService.search).toHaveBeenCalledWith('jazz');
    expect(mockService.getTrending).toHaveBeenCalledWith();
  });

  it('loads one track and its posts by id', async () => {
    mockService.findOne.mockResolvedValue({ id: 'audio-1' });
    mockService.getAudioPosts.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/audio/audio-1')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/audio/audio-1/posts')
      .set(BEARER)
      .expect(200);

    expect(mockService.findOne).toHaveBeenCalledWith('audio-1');
    expect(mockService.getAudioPosts).toHaveBeenCalledWith('audio-1');
  });
});
