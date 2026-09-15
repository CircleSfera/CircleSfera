import type { INestApplication } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
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
import { AudioService } from '../audio/audio.service.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
} from '../common/testing/http-controller.js';
import { AdminService } from './admin.service.js';
import { AdminMediaController } from './admin-media.controller.js';

describe('AdminMediaController', () => {
  let app: INestApplication;

  const dto = {
    title: 'Track',
    artist: 'Artist',
    url: 'https://cdn.example/a.mp3',
    duration: 120,
  };

  const mockAudio = {
    findAllPaginated: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const mockAdmin = {
    logAction: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminMediaController],
      providers: [
        { provide: AudioService, useValue: mockAudio },
        { provide: AdminService, useValue: mockAdmin },
      ],
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

  it('rejects audio list without credentials', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/audio').expect(401);

    expect(mockAudio.findAllPaginated).not.toHaveBeenCalled();
  });

  it('rejects audio list with a user session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/audio')
      .set(BEARER)
      .expect(401);

    expect(mockAudio.findAllPaginated).not.toHaveBeenCalled();
  });

  it('rejects create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/audio')
      .set(ADMIN_BEARER)
      .send({ ...dto, extra: 'nope' })
      .expect(400);

    expect(mockAudio.create).not.toHaveBeenCalled();
  });

  it('lists audio with default and parsed pagination', async () => {
    mockAudio.findAllPaginated.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/admin/audio')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/audio')
      .query({ page: 2, limit: 5, search: 'jazz' })
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockAudio.findAllPaginated).toHaveBeenNthCalledWith(
      1,
      1,
      10,
      undefined,
    );
    expect(mockAudio.findAllPaginated).toHaveBeenNthCalledWith(2, 2, 5, 'jazz');
  });

  it('creates audio then logs CREATE_AUDIO as adminId', async () => {
    mockAudio.create.mockResolvedValue({ id: 'audio-1' });
    mockAdmin.logAction.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/audio')
      .set(ADMIN_BEARER)
      .send(dto)
      .expect(201);

    expect(res.body).toEqual({ id: 'audio-1' });
    expect(mockAudio.create).toHaveBeenCalledWith(dto);
    expect(mockAdmin.logAction).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      AdminAction.CREATE_AUDIO,
      'audio',
      'audio-1',
      'Track: Track by Artist',
    );
  });

  it('updates audio then logs UPDATE_AUDIO as adminId', async () => {
    mockAudio.update.mockResolvedValue({ id: 'audio-1' });
    mockAdmin.logAction.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .patch('/api/v1/admin/audio/audio-1')
      .set(ADMIN_BEARER)
      .send(dto)
      .expect(200);

    expect(mockAudio.update).toHaveBeenCalledWith('audio-1', dto);
    expect(mockAdmin.logAction).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      AdminAction.UPDATE_AUDIO,
      'audio',
      'audio-1',
      'Updated track: Track',
    );
  });

  it('deletes audio then logs DELETE_AUDIO as adminId', async () => {
    mockAudio.delete.mockResolvedValue({ ok: true });
    mockAdmin.logAction.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete('/api/v1/admin/audio/audio-1')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockAudio.delete).toHaveBeenCalledWith('audio-1');
    expect(mockAdmin.logAction).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      AdminAction.DELETE_AUDIO,
      'audio',
      'audio-1',
    );
  });
});
