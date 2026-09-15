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
import { EditsController } from './edits.controller.js';
import { EditsService } from './edits.service.js';

describe('EditsController', () => {
  let app: INestApplication;

  const mockService = {
    create: vi.fn(),
    findAll: vi.fn(),
    startCaptions: vi.fn(),
    getCaptionsJob: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [EditsController],
      providers: [{ provide: EditsService, useValue: mockService }],
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
      .post('/api/v1/edits')
      .send({
        mediaUrl: 'https://cdn.example/clip.mp4',
        state: { clips: [] },
      })
      .expect(401);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/edits')
      .set(BEARER)
      .send({
        mediaUrl: 'https://cdn.example/clip.mp4',
        state: { clips: [] },
        ownerId: 'attacker',
      })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('creates an edit as the session profile', async () => {
    mockService.create.mockResolvedValue({ id: 'edit-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/edits')
      .set(BEARER)
      .send({
        mediaUrl: 'https://cdn.example/clip.mp4',
        state: { clips: [] },
      })
      .expect(201);

    expect(res.body).toEqual({ id: 'edit-1' });
    expect(mockService.create).toHaveBeenCalledWith(
      TEST_USER.profileId,
      expect.objectContaining({
        mediaUrl: 'https://cdn.example/clip.mp4',
        state: { clips: [] },
      }),
    );
  });

  it('lists edits as the session profile', async () => {
    mockService.findAll.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/edits')
      .set(BEARER)
      .expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith(TEST_USER.profileId);
  });

  it('starts captions as the session profile and unwraps clipId', async () => {
    mockService.startCaptions.mockResolvedValue({ jobId: 'job-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/edits/edit-1/captions')
      .set(BEARER)
      .send({ clipId: 'clip-1' })
      .expect(201);

    expect(res.body).toEqual({ jobId: 'job-1' });
    expect(mockService.startCaptions).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'edit-1',
      'clip-1',
    );
  });

  it('reads a captions job as the session profile', async () => {
    mockService.getCaptionsJob.mockResolvedValue({ status: 'done' });

    await request(app.getHttpServer())
      .get('/api/v1/edits/edit-1/captions/job-1')
      .set(BEARER)
      .expect(200);

    expect(mockService.getCaptionsJob).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'edit-1',
      'job-1',
    );
  });

  it('reads, updates and deletes an edit as the session profile', async () => {
    mockService.findOne.mockResolvedValue({ id: 'edit-1' });
    mockService.update.mockResolvedValue({ id: 'edit-1' });
    mockService.remove.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .get('/api/v1/edits/edit-1')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .put('/api/v1/edits/edit-1')
      .set(BEARER)
      .send({ name: 'Cut 2' })
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/edits/edit-1')
      .set(BEARER)
      .expect(200);

    expect(mockService.findOne).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'edit-1',
    );
    expect(mockService.update).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'edit-1',
      { name: 'Cut 2' },
    );
    expect(mockService.remove).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'edit-1',
    );
  });
});
